import { defineConfig } from "eslint/config";
import jsonc from "eslint-plugin-jsonc";
import markdown from "eslint-plugin-markdown";
import globals from "globals";
import parser from "jsonc-eslint-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default defineConfig([{
    extends: compat.extends(
        "eslint:recommended",
        "plugin:jsonc/recommended-with-json",
        "plugin:jsonc/recommended-with-jsonc",
        "plugin:jsonc/recommended-with-json5",
        "plugin:markdown/recommended",
    ),

    plugins: {
        jsonc,
        markdown,
    },

    languageOptions: {
        globals: {
            ...globals.node,
            ...globals.browser,
        },

        ecmaVersion: 12,
        sourceType: "commonjs",
    },

    rules: {
        "no-console": ["warn", {
            allow: ["error"],
        }],

        "no-unused-vars": ["error", {
            argsIgnorePattern: "^(req|res|next)$",
        }],

        eqeqeq: "error",
        curly: "error",
        "jsonc/sort-keys": "error",
    },
}, {
    files: ["**/*.json", "**/*.json5", "**/*.jsonc"],

    languageOptions: {
        parser: parser,
    },
}, {
    files: ["**/*.md"],
    processor: "markdown/markdown",
}, {
    files: ["public/js/*.js"],

    languageOptions: {
        globals: {
            ...globals.browser,
            ...globals.node,
        },

        ecmaVersion: 5,
        sourceType: "module",
    },
}]);