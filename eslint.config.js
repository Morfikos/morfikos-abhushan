import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "apps/web/components/base/**",
      "apps/web/components/application/**",
      "apps/web/components/foundations/**",
      "apps/web/hooks/use-breakpoint.ts",
      "apps/web/hooks/use-resize-observer.ts",
      "apps/web/utils/cx.ts",
      "apps/web/utils/is-react-component.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
