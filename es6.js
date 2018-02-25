/* eslint-env es6, node */
const HTTP = require('http')
const HTTPS = require('https')
const OpenSSL = require('crypto')

const BodyParser = require('co-body')
const DataLoader = require('dataloader')

const _ = {} // duplicates essential functionality:
_.get = (maybeObject, keyString, defaultValue) => {
	return Object(maybeObject)[keyString] || defaultValue
}

class SparkResponseError extends Error {

	constructor (res) {
		const body = SparkResponseError.getBody(res)
		// eslint-disable-next-line no-magic-numbers
		const statusCode = _.get(res, 'statusCode', 400)
		const text = _.get(body, 'message', HTTP.STATUS_CODES[statusCode])
		super(`${text} (tracking ID: ${_.get(body, 'trackingid', 'none')})`)
		Object.freeze(Object.defineProperty(this, 'response', { value: res }))
	}

	inspect () {
		const body = SparkResponseError.getBody(this.response) // valid JSON
		return `${SparkResponseError.name} ${JSON.stringify(body, null, '\t')}`
	}

	static getBody (any) {
		return _.get(any, 'body', {})
	}

}

// will batch and cache REST API response(s):
class SparkWebhookLoader extends DataLoader {
	constructor (sparkAccessToken) {
		const getWebhook = webhookID => new Promise((resolve, reject) => {
			const options = {
				headers: {
					Accept: 'application/json', // required
					Authorization: `Bearer ${sparkAccessToken}`,
				},
				hostname: 'api.ciscospark.com',
				path: `/v1/webhooks/${webhookID}`,
			}
			const req = HTTPS.get(options, (res) => {
				const done = (body) => {
					res.body = body // for SparkResponseError
					// eslint-disable-next-line no-magic-numbers
					if (res.statusCode === 200) resolve(body)
					else reject(new SparkResponseError(res))
				}
				// consume the (incoming) res much like a req
				BodyParser.json({ req: res }).then(done, reject)
			})
			req.once('error', reject)
		})
		super(webhookIDs => Promise.all(webhookIDs.map(getWebhook)))
	}
}

// Once a token is known, it may be used to load a user's webhook details.
const loaders = new DataLoader((tokens) => {
	// Any token which is clearly invalid could/should throw here instead?
	return Promise.all(tokens.map(token => new SparkWebhookLoader(token)))
})

const Spark = {
	RequestCache: WeakMap,
	ResponseError: SparkResponseError,
	getAccessToken: () => {
		// eslint-disable-next-line no-process-env
		return Promise.resolve(process.env.CISCOSPARK_ACCESS_TOKEN)
	},
	getWebhookDetails: (maybeWebhook) => {
		// could/should pass args to getAccessToken?
		const createdBy = _.get(maybeWebhook, 'createdBy')
		const id = _.get(maybeWebhook, 'id', maybeWebhook)
		return Spark.getAccessToken(createdBy)
			.then(token => loaders.load(token))
			.then(loader => loader.load(id))
	},
}

const WEBHOOK_HMAC_HEADER_NAME = 'x-spark-signature'
const WEBHOOK_BODY_LIMIT_BYTES = 1048576 // one megabyte
const hmacStream = (utf8, secret, algorithm = 'sha1') => {
	return OpenSSL.createHmac(algorithm, secret).update(utf8, 'utf8')
}

const validateIncomingWebhook = (body, headers) => Promise.resolve()
	.then(() => {
		const json = JSON.parse(body) // may throw (will reject)
		const header = _.get(headers, WEBHOOK_HMAC_HEADER_NAME, '')
		if (!header) throw new Error(`missing ${WEBHOOK_HMAC_HEADER_NAME}`)
		return Spark.getWebhookDetails(json)
			.then(({ secret }) => {
				if (!secret) throw new Error('missing webhook secret')
				const actual = hmacStream(body, secret).digest() // Buffer
				const expected = Buffer.alloc(actual.length, header, 'hex')
				if (OpenSSL.timingSafeEqual(actual, expected)) return json
				throw new Error(`invalid ${WEBHOOK_HMAC_HEADER_NAME}`)
			})
	})

// unofficially support koa-bodyparser
const RAW_BODY_REQUEST_KEY = 'rawBody'

const validate = (req) => {
	/* istanbul ignore next */
	if (validate.cache.has(req)) {
		// coalesce calls on same req:
		return validate.cache.get(req)
	}
	if (!(_.get(req, 'req', req) instanceof HTTP.IncomingMessage)) {
		return Promise.reject(new Error('cannot validate request'))
	}
	const promise = Promise.resolve()
		.then(() => {
			/* istanbul ignore next */
			if (RAW_BODY_REQUEST_KEY in req) {
				const text = req[RAW_BODY_REQUEST_KEY] // upstream
				return validateIncomingWebhook(text, req.headers)
			}
			return BodyParser.text(req, { limit: WEBHOOK_BODY_LIMIT_BYTES })
				.then((text) => {
					req[RAW_BODY_REQUEST_KEY] = text // downstream
					return validateIncomingWebhook(text, req.headers)
				})
		})
		.then((result) => {
			req.body = result
			return result
		})
		.catch((reason) => {
			// auto-evict on rejection:
			validate.cache.delete(req)
			return Promise.reject(reason)
		})
	validate.cache.set(req, promise)
	return promise
}

/*
 * WeakMap is a perfect default RequestCache
 * Promise(s) will be GC'd along with req(s)
 * due to eviction semantics of "weak" key(s)
 */
validate.cache = new Spark.RequestCache()

Object.defineProperty(validate, 'loaders', { value: loaders })
Object.defineProperty(Spark, 'validate', { value: validate })
module.exports = Object.assign(Spark, { default: validate })
