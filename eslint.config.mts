import globals from "globals";
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import type { Config } from "typescript-eslint";

const config: Config = [
    eslint.configs.all,
    ...tseslint.configs.all,

    { files: ["src/**/*.ts", "eslint.config.mts"] },
    { ignores: ["out", "saved_for_later"] },
    {
        linterOptions: {
            reportUnusedDisableDirectives: "warn",
            reportUnusedInlineConfigs: "warn",
        },
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
            },
            parser: tseslint.parser,
            parserOptions: {
                projectService: {
                    allowDefaultProject: ["eslint.config.mts"],
                },
            },
            sourceType: "module",
        },
        // TODO(stefano): add "documentation" comments as to why a lint might be enabled/disabled
        rules: {
            "semi": "error",
            "curly": "off",
            "eqeqeq": "error",
            "no-throw-literal": "warn",
            "no-implicit-coercion": "error",
            "no-constructor-return": "error",
            "no-duplicate-imports": "off",
            "no-self-compare": "error",
            "no-template-curly-in-string": "warn",
            "no-unmodified-loop-condition": "warn",
            "no-unreachable-loop": "warn",
            "no-useless-assignment": "warn",
            "block-scoped-var": "error",
            "class-methods-use-this": "warn",
            "default-case": "off",
            "default-case-last": "warn",
            "default-param-last": "error",
            "dot-notation": "error",
            "func-style": [ "error", "declaration" ],
            "no-case-declarations": "error",
            "no-else-return": "warn",
            "no-empty-function": "warn",
            "no-eval": "error",
            "camelcase": "off",
            "one-var": "off",
            "capitalized-comments": "off",
            "no-param-reassign": "off",
            "sort-keys": "off",
            "no-ternary": "off",
            "no-plusplus": "off",
            "no-continue": "off",
            "guard-for-in": "off",
            "sort-imports": "off",
            "no-warning-comments": "off",
            "no-inline-comments": "off",
            "no-labels": "off",

            "@typescript-eslint/init-declarations": "off",
            "no-undefined": "off",
            "no-global-assign": "error",
            "no-shadow-restricted-names": "error",

            "id-length": "off",
            "complexity": "off",
            "max-statements": "off",
            "max-lines-per-function": "off",
            "max-lines": "off",
            "@typescript-eslint/max-params": "off",

            "@typescript-eslint/consistent-type-definitions": "off",
            "@typescript-eslint/no-magic-numbers": "off",
            "@typescript-eslint/prefer-readonly-parameter-types": "off",
            "@typescript-eslint/no-unsafe-type-assertion": "off",
            "@typescript-eslint/consistent-indexed-object-style": "off",
            "@typescript-eslint/non-nullable-type-assertion-style": "warn",
            "@typescript-eslint/no-non-null-assertion": "off",
            "@typescript-eslint/no-namespace": "off",
            "@typescript-eslint/no-base-to-string": "error",
            "@typescript-eslint/method-signature-style": "off",
            "@typescript-eslint/member-ordering": "off",
            "@typescript-eslint/guard-for-in": "off",
            "@typescript-eslint/restrict-template-expressions": [
                "error", {
                    allowNumber: true,
                    allowBoolean: true,
                }
            ],
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
            "@typescript-eslint/no-use-before-define": [
                "warn",
                {
                    functions: false,
                    classes: false,
                }
            ],

            "@typescript-eslint/no-empty-function": "off", // already handled by no-empty-function
        },
    },
];

export default config;
