// const path = require('path');

module.exports = {
	root: true,
	extends: ['@hokify'],
	/* parserOptions: {
		project: './tsconfig.eslint.json'
	},*/
	overrides: [
		{
			files: ['*.test.ts', '*.spec.ts'],
			env: {
				mocha: true
			},
			rules: {
				'@typescript-eslint/no-unused-expressions': 'off'
			}
		}
	]
};
