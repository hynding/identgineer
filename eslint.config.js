import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/",
      ".claude/",
      "**/dist/",
      "**/www/",
      "**/.stencil/",
      "**/loader/",
      "packages/components/src/components.d.ts",
      "**/coverage/",
      "**/test-results/",
      "**/playwright-report/",
      "cms/generated/",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    // Stencil declares its JSX namespace without an Element type, so every JSX expression has
    // the error type and these three rules would reject all of them. The rest stay on.
    files: ["**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },
  {
    // Config files are plain JS and sit outside every tsconfig.
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    // The demo pages' script runs in the browser.
    files: ["packages/components/src/demo.js", "packages/components/src/fixtures/*.js"],
    languageOptions: { globals: globals.browser },
  },
  prettier,
);
