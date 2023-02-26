/* eslint-env node */
module.exports = {

	extends: [
		'eslint:all',
	],

	reportUnusedDisableDirectives: true,

	root: true,

	rules: {
		'array-bracket-newline': ['off'],
		'array-element-newline': ['off'],
		'arrow-body-style': ['off'],
		'arrow-parens': ['error', 'as-needed', { requireForBlockBody: true }],
		'capitalized-comments': ['off'],
		'comma-dangle': ['error', 'always-multiline'],
		'curly': ['error', 'multi-line'],
		'dot-location': ['error', 'property'],
		'function-call-argument-newline': ['off'],
		'id-length': ['error', { exceptions: ['_'] }],
		'indent': ['error', 'tab'],
		'line-comment-position': ['off'],
		'lines-around-comment': ['off'],
		'max-len': ['error', { tabWidth: 2 }],
		'multiline-ternary': ['off'],
		'newline-after-var': ['off'],
		'newline-before-return': ['off'],
		'no-div-regex': ['off'],
		'no-inline-comments': ['off'],
		'no-magic-numbers': ['error', { ignore: [0, 1] }],
		'no-tabs': ['off'],
		'no-ternary': ['off'],
		'object-curly-newline': ['off'],
		'object-curly-spacing': ['error', 'always'],
		'object-property-newline': ['off'],
		'one-var': ['off'],
		'padded-blocks': ['off'],
		'quote-props': ['error', 'consistent-as-needed'],
		'quotes': ['error', 'single'],
		'semi': ['error', 'never'],
		'spaced-comment': ['off'],
		'strict': ['error', 'never'],
	},

}
