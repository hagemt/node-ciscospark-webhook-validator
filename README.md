# Cisco Spark Webhook Validator

The default `Spark` export provides an safe and efficient `validate` Function.

## Example

In your project: `npm install --save ciscospark-webhook-validator`

In `server.js`, or elsewhere in your application's module(s):

```javascript

// business logic of a Spark webhook application:
const handleJSON = ({ data, event, resource }) => {
	const isMessagesCreated = resource === 'messages' && event === 'created'
	if (!isMessagesCreated || data.personEmail.endsWith('@sparkbot.io')) return
	console.log('some human (not a Bot) created new Spark message(s):', data)
}

// see section below for customization; this is basic usage:
const { validate } = require('ciscospark-webhook-validator')

// request flow: validate some JSON body (handle it IFF valid)
// possible responses are: 202 Accepted / 406 Not Acceptable
const server = require('http').createServer((req, res) => {
	const onceAccepted = () => Object.assign(res, { statusCode: 202 }).end()
	const onceNotAcceptable = () => Object.assign(res, { statusCode: 406 }).end()
	validate(req).then(handleJSON).then(onceAccepted, onceNotAcceptable)
})

// with async / await (or co / yield) validation could be:
// const validJSON = await validate(req).catch(() => false)
// if (validJSON) handleJSON(validJSON) // otherwise, ignored

const port = process.env.PORT || 8080
server.listen(({ port }, (listenError) => {
	if (listenError) {
		console.error(listenError)
		process.exit(1)
	} else {
		console.log(`listening on PORT=${port}`)
	}
})

// PROTIP: in another terminal, run these commands:
// npm install ngrok # https://www.npmjs.com/package/ngrok
// node_modules/.bin/ngrok http $PORT # targetUrl is HTTPS
// with your token from https://developer.ciscospark.com/
// create a new Spark webhook w/ $secret and $targetUrl
// open http://localhost:4040/ in your favorite browser

```

## Basic use, safety, correctness, and efficiency

~100 SLOC is provided by a single ES6 module. (and test coverage is complete)

N.B. Legacy applications may `require('ciscospark-webhook-validator/es5')`.

### Algorithm Correctness

Via `co-body` a `req`'s body is digested as text and then `JSON.parse`'d.

Using HTTPS + Authorization, that webhook's secret is requested from Spark.

X-Spark-Signature is compared against the digest; validated JSON is returned.

If possible, NodeJS's `crypto.timingSafeEqual` is used to compare Buffer bytes.

N.B. Prior to v6.6.0, this Function was not available; a fallback is provided.

Correctness follows from use of the webhook's fetched secret for validation.

### Algorithm Efficiency

Efficiently is achieved through use of a `RequestCache` such that:

1) Calls to `validate` that run on the same request are coalesced
3) Calls to `validate` that load the same token do so exactly once
2) Calls to `validate` that load the same webhook do so exactly once

The first relies on the `RequestCache` (`WeakMap`) implementation.

The second and third are a facility of the `dataloader` implementation.

A basic example is included above. See the next section for advanced usage.

## Customization

It is easy to adjust the validation process for many special circumstances:

1) If your application uses a single token, export `CISCOSPARK_ACCESS_TOKEN`
2) Or, `Spark.getAccessToken` may be replaced with a Promise-returning Function
3) `Spark.getWebhookDetails` may be replaced similarly (see examples below)
4) Additionally, the RequestCache and ResponseError type(s) may be replaced

### Examples

Case 1: `process.env.CISCOSPARK_ACCESS_TOKEN = ... // later, validate`

#### When tokens may/must be provided somehow

For example, when tokens must be loaded from a secret store:

```javascript
const Spark = require('ciscospark-webhook-validator')
Spark.getAccessToken = creatorID => vault.getAccessToken(creatorID)
```

#### When webhooks may/must be provided somehow

For example, if the webhook secret is a constant value:

```javascript
const Spark = require('ciscospark-webhook-validator')
Spark.getWebhookDetails = () => Promise.resolve({ secret: '...' })
```
