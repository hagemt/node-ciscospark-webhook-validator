/* eslint-env es6, node */
/* eslint-disable no-process-env */
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

if (!module.parent) {
	// ignores process.env.CISCOSPARK_ACCESS_TOKEN:
	Spark.getAccessToken = () => Promise.resolve('')
	Spark.getRegisteredWebhook = () => Promise.resolve({
		secret: 'correct-horse-battery-staple',
	})
	// eslint-disable-next-line no-magic-numbers
	const port = process.env.PORT || 8080
	// PROTIP: in another terminal, run these commands:
	// npm install ngrok # https://www.npmjs.com/package/ngrok
	// node_modules/.bin/ngrok http $PORT # targetUrl = HTTPS
	// with your token from https://developer.ciscospark.com/
	// create a new Spark webhook w/ $secret and $targetUrl
	// open http://localhost:4040/ in your favorite browser
	server.listen({ port }, (listenError) => {
		if (listenError) {
			console.error(listenError) // eslint-disable-line no-console
			process.exit(1) // eslint-disable-line no-process-exit
		}
	})
}
