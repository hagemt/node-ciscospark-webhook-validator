# Cisco Spark Webhook Validator

Official documentation available at: https://developer.ciscospark.com/webhooks-explained.html

This module facilitates business-logic that operates on a Cisco Spark webhook payload, such as:

```javascript
const businessLogic = ({ data, event, resource }) => {
	const isMessagesCreated = resource === 'messages' && event === 'created'
	if (!isMessagesCreated || data.personEmail.endsWith('@sparkbot.io')) return
	console.log('some human (not a Bot) created new Spark message(s):', data)
}
```

The default `Spark` export provides a safe `validate` Function that can be customized for optimal efficiency.

## Examples

In your project: `npm install --save ciscospark-webhook-validator`

In `server.js`, or elsewhere in your application's module(s):

```javascript
// see sections below for basic usage or full customization:
const { validate } = require('ciscospark-webhook-validator')
const server = require('http').createServer(/* listener */)
```

### Basic Usage (ES6, can be adapted for ES5 or ES7+)

```javascript
// event listener fires business-logic only for valid webhook payloads
// (a payload is valid if and only if its HMAC matches X-Spark-Signature)
// possible responses are: 202 Accepted / 406 Not Acceptable (no body)
server.on('request', (req, res) => {
	const onceAccepted = () => Object.assign(res, { statusCode: 202 }).end()
	const onceNotAcceptable = () => Object.assign(res, { statusCode: 406 }).end()
	validate(req).then(businessLogic).then(onceAccepted, onceNotAcceptable)
})

// with async / await (or co / yield) validation could be:
// request.body = await validate(req).catch(() => null)
// if (request.body) businessLogic(request.body)
```

### Using `ngrok`

```
if (process.env.CISCOSPARK_ACCESS_TOKEN) {
	const port = process.env.PORT || 8080
	server.listen({ port }, (listenError) => {
		if (listenError) {
			console.error(listenError)
			process.exitCode = 1
		} else {
			console.log(`listening on PORT=${port}`)
		}
	})
}

// PROTIP: in another terminal, run these commands:
// npm install ngrok # https://www.npmjs.com/package/ngrok
// node_modules/.bin/ngrok http $PORT # targetUrl is HTTPS
// with your token from https://developer.ciscospark.com/
// create a new Spark webhook w/ $secret and $targetUrl
// open http://localhost:4040/ in your favorite browser
```

## Notes on module, correctness, and efficiency

~100 SLOC is provided by a single ES6 module. (and test coverage is complete)

NodeJS's `crypto.timingSafeEqual` is used to compare the contents of Buffers.

N.B. Legacy applications may `require('ciscospark-webhook-validator/es5')`.

### Algorithm Correctness

Via `co-body` a `req`'s body is digested as text and then `JSON.parse`'d.

Using HTTPS + `Authorization`, that webhook's `secret` is requested from Spark.

`X-Spark-Signature` is compared against the digest; validated JSON is returned.

Correctness follows from use of the webhook's fetched `secret` for HMAC validation.

### Algorithm Efficiency

Efficiently is achieved through use of a `RequestCache` such that:

1) Calls to `validate` that run on the same request are coalesced
3) Calls to `validate` that load the same token do so exactly once
2) Calls to `validate` that load the same webhook do so exactly once

The first relies on the `RequestCache` (`WeakMap`) implementation.

The second and third are a facility of the `dataloader` implementation.

A basic example is included above. See the next section for advanced usage.

## Full Customization

It is easy to adjust the validation process for many special circumstances:

1) If your application uses a single token, export `CISCOSPARK_ACCESS_TOKEN`
2) Or, `Spark.getAccessToken` may be replaced with a Promise-returning Function
3) `Spark.getWebhookDetails` may be replaced similarly (see examples below)
4) `Spark.RequestCache` and `Spark.ResponseError` type(s) may be replaced

### Bearer Tokens and Webhook Secrets

If your application is a bot, the easiest way to provide its token is via environment variables:

`process.env.CISCOSPARK_ACCESS_TOKEN = ... // all future requests to Spark will use this, by default`

By default, one request is made to Spark for each unique webhook registered to your application.

#### When tokens may/must be provided somehow

For example, if your application loads tokens from a secret store:

```javascript
const Spark = require('ciscospark-webhook-validator')
Spark.getAccessToken = creatorID => vault.getAccessToken(creatorID)
```

#### When webhooks may/must be provided somehow

For example, if your application makes use of a single, static webhook:

```javascript
const Spark = require('ciscospark-webhook-validator')
Spark.getWebhookDetails = () => Promise.resolve({ secret: '...' })
```
