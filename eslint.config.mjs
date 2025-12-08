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
        ignores: [
            "node_modules/",
            "public/js/*.js",
            "package-lock.json"
        ],

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

            // Disabled lint rules
            "no-console": "off",
            "no-redeclare": "off",
            "no-unused-vars": "off",
            "eqeqeq": "off",
            "curly": "off",
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
            "jsonc/sort-keys": "off"  // Turn OFF key sorting
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
    }
];
