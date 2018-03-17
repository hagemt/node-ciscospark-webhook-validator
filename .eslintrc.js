/* eslint-env node */

/*
 * this project is something of a test-bed for the categories of eslint rules
 * before tests, eslint runs with --fix and after test, with --max-warnings 0
 * for best results, configure running eslint automatically it in your editor
 */

const rulesAdded = {
	'arrow-parens': ['error', 'as-needed', { requireForBlockBody: true }],
	'comma-dangle': ['error', 'always-multiline'],
	'curly': ['error', 'multi-line'],
	'dot-location': ['error', 'property'],
	'id-length': ['error', { exceptions: ['_'] }],
	'indent': ['error', 'tab'],
	'linebreak-style': ['error', 'unix'],
	'max-len': ['error', { code: 128, tabWidth: 2 }],
	'no-magic-numbers': ['error', { ignore: [0, 1, 2] }],
	'object-curly-spacing': ['error', 'always'],
	'quote-props': ['error', 'consistent-as-needed'],
	'quotes': ['error', 'single'],
	'semi': ['error', 'never'],
	'strict': ['error', 'never'],
}

const rulesRemoved = {
	'array-bracket-newline': ['off'],
	'array-element-newline': ['off'],
	'arrow-body-style': ['off'],
	'capitalized-comments': ['off'],
	'line-comment-position': ['off'],
	'lines-around-comment': ['off'],
	'multiline-ternary': ['off'],
	'newline-after-var': ['off'],
	'newline-before-return': ['off'],
	'no-div-regex': ['off'],
	'no-inline-comments': ['off'],
	'no-tabs': ['off'],
	'no-ternary': ['off'],
	'object-curly-newline': ['off'],
	'object-property-newline': ['off'],
	'one-var': ['off'],
	'padded-blocks': ['off'],
	'spaced-comment': ['off'],
}

module.exports = {

	env: {
		es6: true,
	},

	extends: [
		'eslint:all',
		'plugin:import/recommended',
		'plugin:mocha/recommended',
		'plugin:node/recommended',
	],

	parserOptions: {
		ecmaVersion: 2017,
	},

	plugins: [
		'import',
		'mocha',
		'node',
	],

	rules: Object.assign({}, rulesAdded, rulesRemoved, {
		'import/unambiguous': 'off',
	}),

}
