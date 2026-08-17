import { defineConfig } from "vitest/config";
import base from "./vitest.config";

// Runs the manual QA seeding scripts that the default config deliberately skips
// (see the `db/seed-qa-*.test.ts` entry there). They create live rows for a
// fixture account instead of asserting anything, so they must never run as part
// of the suite — but they still need the app's aliases, setup and DB env.
//
//   pnpm --filter tiffin-grab exec vitest run --config vitest.seed.config.ts db/seed-qa-second-sub.test.ts
//
// `--exclude` on the CLI only ADDS globs, so a second config is the only way to
// drop one the base config sets.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    exclude: (base.test?.exclude ?? []).filter((glob) => glob !== "db/seed-qa-*.test.ts"),
  },
});
