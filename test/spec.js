/* eslint-env es6, mocha, node */
/* eslint-disable max-lines-per-function */
const HTTP = require('http')
const OpenSSL = require('crypto')

const nock = require('nock')
const sinon = require('sinon')
const request = require('request')
const UUID = require('uuid')

const Spark = require('../es6.js')

// eslint-disable-next-line no-magic-numbers
const [BYTES, NOT_OK, OK, PORT] = [32, 400, 200, process.env.PORT || '48080']

const hexHMAC = (algorithm, secret, ...args) => {
	const stream = OpenSSL.createHmac(algorithm, secret) // supports 'sha1'
	for (const arg of args) stream.update(arg) // may be Buffer, String, etc.
	return stream.digest('hex') // 160-bit SHA-1: 20 bytes (40 hex characters)
}

const urlSafe = base64 => base64.replace(/=+$/gu, '') // strip '='s from EOL
	.replace(/\+/gu, '-') // replace each '+' (URL query conjunction) with '-'
	.replace(/\//gu, '_') // replace each '/' (URL path conjunction) with '_'

const base64url = (...args) => urlSafe(Buffer.from(...args).toString('base64'))

const createdBy = base64url(`ciscospark://us/BOT/${UUID.v4()}`)
const id = base64url(`ciscospark://us/WEBHOOK/${UUID.v4()}`)
const secret = base64url(OpenSSL.randomBytes(BYTES))
const token = base64url(OpenSSL.randomBytes(BYTES))

describe('default (Spark)', () => {

	const sandbox = sinon.createSandbox()
	const SECRET = 'CISCOSPARK_ACCESS_TOKEN'

	before(() => {
		process.env[SECRET] = token
	})

	describe('RequestCache', () => {
		it('by default, uses a WeakMap', () => {
			Spark.RequestCache.should.equal(WeakMap)
		})
	})

	describe('ResponseError', () => {
		it('by default, parses its message from a response body', () => {
			const json = { message: 'string', trackingid: 'string' }
			const text = JSON.stringify(json, null, '\t') // for #inspect
			const message = `${json.message} (tracking ID: ${json.trackingid})`
			const error = new Spark.ResponseError({ body: json })
			error.should.have.property('message', message)
			error.should.have.property('response', { body: json })
			error.inspect().should.equal(`${Spark.ResponseError.name} ${text}`)
		})
	})

	describe('getAccessToken (function)', () => {
		it(`by default, Promises process.env.${SECRET}`, () => {
			return Spark.getAccessToken(createdBy)
				.then((value) => {
					token.should.equal(value)
				})
		})
	})

	describe('getWebhookDetails (function)', () => {
		it('by default, Promises a registered Spark webhook', () => {
			const mock = nock('https://api.ciscospark.com')
			mock.get(`/v1/webhooks/${id}`).reply(OK, { secret })
			return Spark.getWebhookDetails({ createdBy, id })
				.then(({ secret: value }) => {
					secret.should.equal(value)
				})
		})
	})

	describe('validate{IncomingWebhook} (function)', () => {

		const server = HTTP.createServer()
		const outer = sinon.createSandbox()

		const defaults = Object.freeze({
			json: true, // body's are JSON
			url: `http://localhost:${PORT}/`,
		})

		const sendJSON = (...args) => new Promise((resolve, reject) => {
			request(Object.assign({}, defaults, ...args), (error, response, body) => {
				if (!error && response.statusCode === OK) resolve(body)
				else reject(error || new Error(response.statusCode))
			})
		})

		beforeEach((done) => {
			const getFakeWebhook = () => Promise.resolve({ secret })
			outer.stub(Spark, 'getWebhookDetails').callsFake(getFakeWebhook)
			server.on('request', (req, res) => {
				const check = (result) => {
					const body = JSON.stringify(result) // echo:
					Object.assign(res, { statusCode: OK }).end(body)
				}
				const checkError = ({ message }) => {
					const body = JSON.stringify({ message }) // dump:
					Object.assign(res, { statusCode: NOT_OK }).end(body)
				}
				Spark.validate(req).then(check, checkError)
			})
			server.listen(PORT, 'localhost', done)
		})

		it('validates webhook JSON (that has the valid signature)', () => {
			const body = Object.freeze({ createdBy, id })
			const headers = {
				'X-Spark-Signature': hexHMAC('sha1', secret, JSON.stringify(body)),
			}
			return sendJSON({ body, headers })
		})

		describe('negative', () => {

			it('does not validate JSON that has an invalid signature', () => {
				const body = Object.freeze({ createdBy, id })
				const digest = hexHMAC('sha1', secret, JSON.stringify(body))
				const headers = {
					// eslint-disable-next-line newline-per-chained-call
					'X-Spark-Signature': digest.split('').reverse().join(''),
				}
				return sendJSON({ body, headers })
					.then(() => {
						return Promise.reject(new Error(OK))
					})
					.catch((reason) => {
						if (reason.message === String(NOT_OK)) {
							return Promise.resolve()
						}
						return Promise.reject(reason)
					})
			})

			it('does not validate JSON that has no signature', () => {
				const body = Object.freeze({ createdBy, id })
				return sendJSON({ body, headers: {} })
					.then(() => {
						return Promise.reject(new Error(OK))
					})
					.catch((reason) => {
						if (reason.message === String(NOT_OK)) {
							return Promise.resolve()
						}
						return Promise.reject(reason)
					})
			})

		})

		describe('exceptions', () => {

			const inner = sinon.createSandbox()

			beforeEach(() => {
				outer.restore()
			})

			it('rejects, if req (and req.req) is not http.IncomingMessage', () => {
				return Promise.all([
					Spark.validate().should.be.rejectedWith(Error),
				])
			})

			it('rejects, if loading an invalid token', () => {
				const getAccessToken = () => Promise.resolve() // no String
				inner.stub(Spark, 'getAccessToken').callsFake(getAccessToken)
				const body = Object.freeze({ createdBy, id })
				const headers = {
					'X-Spark-Signature': hexHMAC('sha1', secret, JSON.stringify(body)),
				}
				return sendJSON({ body, headers }).should.be.rejectedWith(Error)
			})

			it('rejects, if loading an invalid webhook', () => {
				const getWebhookDetails = () => Promise.resolve({}) // no secret
				inner.stub(Spark, 'getWebhookDetails').callsFake(getWebhookDetails)
				const body = Object.freeze({ createdBy, id })
				const headers = {
					'X-Spark-Signature': hexHMAC('sha1', secret, JSON.stringify(body)),
				}
				return sendJSON({ body, headers }).should.be.rejectedWith(Error)
			})

			it('rejects, if the webhook request is not OK', () => {
				const mock = nock('https://api.ciscospark.com')
				mock.get(`/v1/webhooks/${id}`).reply(NOT_OK)
				const body = Object.freeze({ createdBy, id })
				const headers = {
					'X-Spark-Signature': hexHMAC('sha1', secret, JSON.stringify(body)),
				}
				return sendJSON({ body, headers }).should.be.rejectedWith(Error)
			})

			afterEach(() => {
				inner.restore()
			})

		})

		afterEach((done) => {
			server.removeAllListeners('request')
			Spark.validate.loaders.clearAll()
			server.close(done)
			outer.restore()
		})

	})

	after(() => {
		sandbox.restore()
		delete process.env[SECRET]
	})

})
