/* eslint-env es6 *//* globals console, module, process, require */
const { createServer } = require('http')

// ciscospark-webhook-validator:
const Spark = require('../es6.js')

const server = createServer((req, res) => {
	Spark.validate(req)
		.then(({ data }) => {
			res.statusCode = 202
			res.end(JSON.stringify(data))
		})
		.catch(({ message }) => {
			res.statusCode = 406
			res.end(message)
		})
})

const main = module === require.main

if (main) {
	// an access token is required if your webhook's secret isn't static:
	const secret = process.env.WEBHOOK_SECRET || 'correct-horse-battery-stable'
	//const token = process.env.CISCOSPARK_ACCESS_TOKEN || '...'
	Spark.getWebhookDetails = () => Promise.resolve({ secret })
	//Spark.getAccessToken = () => Promise.resolve(token)

	/*
	 * PROTIP: in another terminal, run these commands:
	 * - npm install ngrok # https://www.npmjs.com/package/ngrok
	 * - node_modules/.bin/ngrok http $PORT # URLs to localhost
	 * with your token from https://developer.ciscospark.com/
	 * 1. create a new Spark webhook w/ secret + HTTPS target URL
	 * 2. open http://localhost:4040/ in your favorite browser
	 * 3. observe each event triggers the relevant webhook
	 * (ngrok provides some UI on port 4040 by default)
	 */
	const port = process.env.PORT || '8080'
	server.listen({ port }, (err) => {
		if (err) {
			console.error(err) // eslint-disable-line no-console
			process.exit(1)
		}
	})
}
