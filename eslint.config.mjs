import globals from "globals";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

/** @type {import('eslint').Linter.Config[]} */
export default [
    {
        files: ["src/**/*.ts"],
    },
    {
        ignores: ["out/**", "out_dev/**"],
    },
    {
        linterOptions: {
            reportUnusedDisableDirectives: "warn",
        },
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node
            },
            parser: "@typescript-eslint/parser",
            // parserOptions: {
            //     projectService: true,
            //     allowDefaultProject: ["*.js"],
            // },
            sourceType: "module",
        },
        rules: {
            // TODO(stefano): more fine grained configurations
            // "@typescript-eslint/restrict-template-expressions": "off",
            // "@typescript-eslint/consistent-indexed-object-style": "off",
            // "@typescript-eslint/non-nullable-type-assertion-style": "off",

            "@typescript-eslint/naming-convention": [
                "warn",
                {
                    selector: ["typeLike"],
                    format: ["PascalCase"]
                },
                {
                    selector: ["variableLike"],
                    format: ["snake_case"],
                    leadingUnderscore: "allow",
                    trailingUnderscore: "allow",
                },
                {
                    selector: ["variableLike"],
                    modifiers: ["const"],
                    format: ["UPPER_CASE", "snake_case"],
                    leadingUnderscore: "allow",
                    trailingUnderscore: "allow",
                }
            ],
            "@typescript-eslint/no-unused-vars": [
                "warn",
                {
                    args: "all",
                    argsIgnorePattern: "^_",
                    caughtErrors: "all",
                    caughtErrorsIgnorePattern: "^_",
                    destructuredArrayIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                    ignoreRestSiblings: true
                }
            ],
            "semi": "error",
            "curly": "error",
            "eqeqeq": "warn",
            "no-throw-literal": "warn",
            "no-implicit-coercion": "error",
            "no-constructor-return": "error",
            "no-duplicate-imports": "error",
            "no-self-compare": "error",
            "no-template-curly-in-string": "warn",
            "no-unmodified-loop-condition": "warn",
            "no-unreachable-loop": "warn",
            "@typescript-eslint/no-use-before-define": [
                "warn",
                {
                    "functions": false,
                    "classes": false,
                }
            ],
            "no-useless-assignment": "warn",
            "block-scoped-var": "error",
            "class-methods-use-this": "warn",
            "default-case": "error",
            "default-case-last": "warn",
            "default-param-last": "error",
            "dot-notation": "error",
            "func-style": [
                "error",
                "declaration"
            ],
            "no-case-declarations": "error",
            "no-else-return": "warn",
            "no-empty-function": "warn",
            "no-eval": "error",
        },
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    // ...tseslint.configs.strictTypeChecked,
    // ...tseslint.configs.stylisticTypeChecked,
];
