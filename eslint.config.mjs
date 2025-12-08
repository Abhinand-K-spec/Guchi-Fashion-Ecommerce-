import js from "@eslint/js";
import jsonc from "eslint-plugin-jsonc";
import markdown from "eslint-plugin-markdown";
import globals from "globals";
import parser from "jsonc-eslint-parser";

export default [

    // ============================================
    // Base JavaScript Configuration
    // ============================================
    {
        files: ["**/*.js"],
        ignores: ["node_modules/"],

        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",

            globals: {
                ...globals.node,
                ...globals.browser,
            },
        },

        plugins: {
            jsonc,
            markdown,
        },

        rules: {
            ...js.configs.recommended.rules,

            "no-console": ["warn", { allow: ["error"] }],
            "no-unused-vars": ["error", { argsIgnorePattern: "^(req|res|next)$" }],
            eqeqeq: "error",
            curly: "error",
        },
    },

    // ============================================
    // JSON / JSONC / JSON5 config
    // ============================================
    {
        files: ["**/*.json", "**/*.json5", "**/*.jsonc"],

        languageOptions: {
            parser,
        },

        plugins: {
            jsonc,
        },

        rules: {
            ...jsonc.configs["recommended-with-json"].rules,
            "jsonc/sort-keys": "error",
        },
    },

    // ============================================
    // Markdown linting
    // ============================================
    {
        files: ["**/*.md"],

        plugins: {
            markdown,
        },

        processor: "markdown/markdown",
    },

    // ============================================
    // Public folder JS (ES5, frontend only)
    // ============================================
    {
        files: ["public/js/*.js"],

        languageOptions: {
            ecmaVersion: 5,
            sourceType: "module",

            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
    },
];
