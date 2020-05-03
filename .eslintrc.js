module.exports = {
	"root": true,

	"env": {
		"browser": true,
		"es6": true,
		"webextensions": true,
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
		// Require spacing around =>
		"arrow-spacing": "error",

		// Braces only needed for multi-line arrow function blocks
		// "arrow-body-style": ["error", "as-needed"]

		// Always require spacing around a single line block
		"block-spacing": "error",

		// No newline before open brace for a block
		"brace-style": ["error", "1tbs", { "allowSingleLine": true }],

		// No space before always a space after a comma
		"comma-spacing": ["error", {"after": true, "before": false}],

		// Commas at the end of the line not the start
		"comma-style": "error",

		// Warn about cyclomatic complexity in functions.
		// XXX Get this down to 20?
		"complexity": ["error", 34],

		// Don't require spaces around computed properties
		"computed-property-spacing": ["error", "never"],

		// Functions must always return something or nothing
		"consistent-return": "error",

		// XXX This rule line should be removed to enable it. See bug 1487642.
		// Require super() calls in constructors
		"constructor-super": "off",

		// Require braces around blocks that start a new line
		// Note that this rule is likely to be overridden on a per-directory basis
		// very frequently.
		// "curly": ["error", "multi-line"],

		// Encourage the use of dot notation whenever possible.
		"dot-notation": "error",

		// Always require a trailing EOL
		"eol-last": "error",

		// XXX This rule should be enabled, see Bug 1557040
		// No credentials submitted with fetch calls
		"fetch-options/no-fetch-credentials": "off",

		// No spaces between function name and parentheses
		"func-call-spacing": "error",

		// Require function* name()
		"generator-star-spacing": ["error", {"after": true, "before": false}],

		// XXX This rule line should be removed to enable it. See bug 1487642.
		// Enforce return statements in getters
		"getter-return": "off",

		// Two space indent
		"indent": ["off", 2, { "SwitchCase": 1 }],

		// Space after colon not before in property declarations
		"key-spacing": ["error", {
			"afterColon": true,
			"beforeColon": false,
			"mode": "minimum",
		}],

		// Require spaces before and after keywords
		"keyword-spacing": "error",

		// Unix linebreaks
		"linebreak-style": ["error", "unix"],

		// Don't enforce the maximum depth that blocks can be nested. The complexity
		// rule is a better rule to check this.
		"max-depth": "off",

		// Maximum depth callbacks can be nested.
		"max-nested-callbacks": ["error", 10],

		"mozilla/avoid-removeChild": "error",
		"mozilla/consistent-if-bracing": "error",
		"mozilla/import-browser-window-globals": "error",
		"mozilla/import-globals": "error",
		"mozilla/no-compare-against-boolean-literals": "error",
		"mozilla/no-define-cc-etc": "error",
		"mozilla/no-useless-parameters": "error",
		"mozilla/no-useless-removeEventListener": "error",
		"mozilla/reject-importGlobalProperties": ["error", "allownonwebidl"],
		"mozilla/rejects-requires-await": "error",
		"mozilla/use-cc-etc": "error",
		"mozilla/use-chromeutils-generateqi": "error",
		"mozilla/use-chromeutils-import": "error",
		"mozilla/use-default-preference-values": "error",
		"mozilla/use-includes-instead-of-indexOf": "error",
		"mozilla/use-ownerGlobal": "error",
		"mozilla/use-returnValue": "error",
		"mozilla/use-services": "error",

		// Always require parenthesis for new calls
		// "new-parens": "error",

		// Use [] instead of Array()
		"no-array-constructor": "error",

		// Disallow use of arguments.caller or arguments.callee.
		"no-caller": "error",

		// XXX Bug 1487642 - decide if we want to enable this or not.
		// Disallow lexical declarations in case clauses
		"no-case-declarations": "off",

		// XXX Bug 1487642 - decide if we want to enable this or not.
		// Disallow the use of console
		"no-console": "off",

		// XXX Bug 1487642 - decide if we want to enable this or not.
		// Disallow constant expressions in conditions
		"no-constant-condition": "off",

		// No duplicate keys in object declarations
		"no-dupe-keys": "error",

		// If an if block ends with a return no need for an else block
		"no-else-return": "error",

		// No empty statements
		"no-empty": ["error", {"allowEmptyCatch": true}],

		// Disallow eval and setInteral/setTimeout with strings
		"no-eval": "error",

		// Disallow unnecessary calls to .bind()
		"no-extra-bind": "error",

		// XXX Bug 1487642 - decide if we want to enable this or not.
		// Disallow fallthrough of case statements
		"no-fallthrough": "off",

		// Disallow assignments to native objects or read-only global variables
		"no-global-assign": "error",

		// Disallow eval and setInteral/setTimeout with strings
		"no-implied-eval": "error",

		// This has been superseded since we're using ES6.
		// Disallow variable or function declarations in nested blocks
		"no-inner-declarations": "off",

		// Disallow the use of the __iterator__ property
		"no-iterator": "error",

		 // No labels
		"no-labels": "error",

		// Disallow unnecessary nested blocks
		"no-lone-blocks": "error",

		// No single if block inside an else block
		"no-lonely-if": "error",

		// No unnecessary spacing
		"no-multi-spaces": ["error", { exceptions: {
			"ArrayExpression": true,
			"AssignmentExpression": true,
			"ObjectExpression": true,
			"VariableDeclarator": true,
		} }],

		// Nested ternary statements are confusing
		"no-nested-ternary": "error",

		// Use {} instead of new Object()
		"no-new-object": "error",

		// Disallow use of new wrappers
		"no-new-wrappers": "error",

		// Disallow use of event global.
		"no-restricted-globals": ["error", "event"],

		// Disallows unnecessary `return await ...`.
		"no-return-await": "error",

		// No unnecessary comparisons
		"no-self-compare": "error",

		// No comma sequenced statements
		"no-sequences": "error",

		// No declaring variables from an outer scope
		// "no-shadow": "error",

		// No declaring variables that hide things like arguments
		"no-shadow-restricted-names": "error",

		// Disallow throwing literals (eg. throw "error" instead of
		// throw new Error("error")).
		"no-throw-literal": "error",

		// No trailing whitespace
		"no-trailing-spaces": "error",

		// Disallow the use of Boolean literals in conditional expressions.
		"no-unneeded-ternary": "error",

		// No declaring variables that are never used
		"no-unused-vars": ["error", {
			"args": "none",
			"vars": "local",
		}],

		// No using variables before defined
		// "no-use-before-define": ["error", "nofunc"],

		// Disallow unnecessary .call() and .apply()
		"no-useless-call": "error",

		// Don't concatenate string literals together (unless they span multiple
		// lines)
		"no-useless-concat": "error",

		// XXX Bug 1487642 - decide if we want to enable this or not.
		// Disallow unnecessary escape characters
		"no-useless-escape": "off",

		// Disallow redundant return statements
		"no-useless-return": "error",

		// Disallow whitespace before properties.
		"no-whitespace-before-property": "error",

		// No using with
		"no-with": "error",

		// Require object-literal shorthand with ES6 method syntax
		"object-shorthand": ["error", "always", { "avoidQuotes": true }],

		// Prohibit blank lines at the beginning and end of blocks.
		"padded-blocks": ["error", "never"],

		// Require double-quotes everywhere, except where quotes are escaped
		// or template literals are used.
		"quotes": ["error", "single", {
			"allowTemplateLiterals": true,
			"avoidEscape": true,
		}],

		// XXX Bug 1487642 - decide if we want to enable this or not.
		// Require generator functions to contain yield
		"require-yield": "off",

		// No spacing inside rest or spread expressions
		"rest-spread-spacing": "error",

		// Always require semicolon at end of statement
		"semi": ["error", "always"],

		// Require space before blocks
		"space-before-blocks": "error",

		// Never use spaces before function parentheses
		"space-before-function-paren": ["error", {
			"anonymous": "never",
			"asyncArrow": "always",
			"named": "never",
		}],

		// No space padding in parentheses
		// "space-in-parens": ["error", "never"],

		// Require spaces around operators
		"space-infix-ops": ["error", { "int32Hint": true }],

		// ++ and -- should not need spacing
		"space-unary-ops": ["error", {
			"nonwords": false,
			"overrides": {
				"typeof": false, // We tend to use typeof as a function call
			},
			"words": true,
		}],

		// Requires or disallows a whitespace (space or tab) beginning a comment
		"spaced-comment": ["error", "always", { "markers": ["#"] }],

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
