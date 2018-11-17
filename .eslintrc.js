module.exports = {
	"root": true,

	"env": {
		"browser": true,
		"es6": true
	},

	// We would like the same base rules as provided by
	// mozilla/tools/lint/eslint/eslint-plugin-mozilla/lib/configs/recommended.js
	"extends": [
		"eslint:recommended",
	],

	// When adding items to this file please check for effects on sub-directories.
	"plugins": [
		"mozilla",
	],

	"parserOptions": {
		"ecmaVersion": 9,
	},

	"rules": {
		"indent": ["warn", "tab", { "SwitchCase": 0 }],
		"space-in-parens": ["error", "never"],
		"semi-spacing": ["error", {"before": false, "after": true}],
		"func-names": ["error", "never"],
		"curly": ["error"],
		"object-shorthand": ["error", "always", { "avoidQuotes": true }],
	},

	"globals": {
		"Cc": true,
		"ChromeUtils": true,
		"Ci": true,
		"Components": true,
		"Cu": true,
		"dump": true
	},

	"overrides": [{
		"env": {
			"browser": false,
			"mozilla/jsm": true
		},
		"files": "**/*.jsm",
		"rules": {
			"mozilla/mark-exported-symbols-as-used": "error",
			"no-unused-vars": ["error", {
				"args": "none",
				"vars": "all"
			}]
		}
	}]
};
