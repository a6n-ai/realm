import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Shared flat config for every Next.js app in the Realm monorepo.
// Consume via: import next from "@realm/eslint-config/next"; export default next;
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Both apps already mark deliberately-unused bindings with a leading underscore
  // (stub params kept for a signature, destructured-and-dropped fields). Honour it
  // instead of warning on the convention.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);
