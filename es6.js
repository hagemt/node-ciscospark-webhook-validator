/* eslint-env node */
const HTTP = require('http')
const HTTPS = require('https')
const OpenSSL = require('crypto')

const DataLoader = require('dataloader')
//const fetch = require('node-fetch')
const parse = require('co-body')

const _ = {} // duplicates essential functionality:
_.get = (maybeObject, keyString, defaultValue) => {
	return Object(maybeObject)[keyString] || defaultValue
}

// eslint-disable-next-line no-magic-numbers
const [OK, UNAUTHORIZED] = [200, 401]

class SparkResponseError extends Error {

	constructor (res) {
		const body = SparkResponseError.getBody(res)
		const statusCode = _.get(res, 'statusCode', UNAUTHORIZED)
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

const Spark = { // will become module.exports (will include .validate)
	// must evict (and GC) value:Promise(s) along with key:Request(s):
	RequestCache: WeakMap, // has perfect semantics for a RequestCache
	ResponseError: SparkResponseError, // exported for convenience
}

class SparkWebhookLoader extends DataLoader {
	constructor (sparkAccessToken) {
		const fetchWebhook = webhookID => new Promise((resolve, reject) => {
			const options = {
				headers: {
					//Accept: 'application/json', // default
					Authorization: `Bearer ${sparkAccessToken}`,
				},
				hostname: 'api.ciscospark.com',
				path: `/v1/webhooks/${webhookID}`,
			}
			const req = HTTPS.get(options, (res) => {
				const done = (body) => {
					res.body = body // for SparkResponseError
					/* istanbul ignore next */
					if (res.statusCode === UNAUTHORIZED) {
						// forget any token that results in 401:
						Spark.loaders.clear(sparkAccessToken)
					}
					if (res.statusCode === OK) resolve(body)
					else reject(new SparkResponseError(res))
				}
				// consume the (incoming) res much like a req
				parse.json({ req: res }).then(done, reject)
			})
			req.once('error', reject)
		})
		// DL will batch/cache request/response(s) to/from REST API:
		super(webhookIDs => Promise.all(webhookIDs.map(fetchWebhook)))
		// DL Documentation: https://github.com/facebook/dataloader
	}
}

// by default, use the default RequestCache constructor:
Spark.createRequestCache = () => new Spark.RequestCache()

// by default, obtain single token from environment via Promise:
Spark.getAccessToken = (/* createdBy: sparkBotPersonID */) => {
	// eslint-disable-next-line no-process-env
	return Promise.resolve(process.env.CISCOSPARK_ACCESS_TOKEN)
}

// by default, map unique tokens => specialized DL
const defaultDataLoader = new DataLoader((tokens) => {
	// might need to de-duplicate tokens:Array (passed as first argument) or not
	return Promise.all(tokens.map(token => Spark.loaders.createDataLoader(token)))
	// might need LRU cache; for now, just use `DataLoader#clearAll` as needed
})

Spark.loaders = defaultDataLoader // singleton, delegates to:
Spark.loaders.createDataLoader = (...args) => Promise.resolve()
	.then(() => new SparkWebhookLoader(...args)) // special DataLoader

/*
 * By default, use Functions defined above like so:
 * 1. obtain the bot token = f(webhook.createdBy)
 * 2. obtain a specialized DL for webhook metadata
 * 3. obtain webhook metadata (including secret)
 * This scheme ensures data isolated by token.
 *
 * Webhook metadata is never deleted explicitly.
 * However, a DataLoader is forgotten upon 401.
 * This ensures revoked tokens do not persist.
 *
 * (should scale to thousands of tokens/webhooks)
 */
Spark.getWebhookDetails = (maybeWebhook) => {
	const createdBy = _.get(maybeWebhook, 'createdBy')
	const id = _.get(maybeWebhook, 'id', maybeWebhook)
	return Spark.getAccessToken(createdBy)
		.then(token => Spark.loaders.load(token))
		.then(loader => loader.load(id))
}

const WEBHOOK_HMAC_HEADER_NAME = 'x-spark-signature'
const WEBHOOK_BODY_LIMIT_BYTES = 1048576 // one megabyte
const hmacStream = (utf8, secret, algorithm = 'sha1') => {
	return OpenSSL.createHmac(algorithm, secret).update(utf8, 'utf8')
}

const validateIncoming = (body, headers) => Promise.resolve()
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

// support for standard body parser(s):
const RAW_BODY_REQUEST_KEY = 'rawBody'

const validate = (req) => {
	if (!(_.get(req, 'req', req) instanceof HTTP.IncomingMessage)) {
		return Promise.reject(new Error('cannot validate request'))
	}
	const { cache } = validate
	/* istanbul ignore next */
	if (cache.has(req)) {
		// prevents double parse:
		return cache.get(req)
	}
	const promise = Promise.resolve()
		.then(() => {
			/* istanbul ignore next */
			if (RAW_BODY_REQUEST_KEY in req) {
				// for body, already parsed upstream:
				const text = req[RAW_BODY_REQUEST_KEY]
				return validateIncoming(text, req.headers)
			}
			return parse.text(req, { limit: WEBHOOK_BODY_LIMIT_BYTES })
				.then((text) => {
					// for body parsed downstream:
					req[RAW_BODY_REQUEST_KEY] = text
					return validateIncoming(text, req.headers)
				})
		})
		.catch((reason) => {
			// auto-evict on rejection:
			cache.delete(req) // quietly:
			return Promise.reject(reason)
		})
	cache.set(req, promise)
	return promise
}

validate.cache = Spark.createRequestCache() // by default, WeakMap

module.exports = Object.assign(Spark, { default: validate, validate })
