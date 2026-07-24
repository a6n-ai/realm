import { test as base, expect } from "@playwright/test";
import { expectHealthyPage, expectNoHttpFailure } from "./helpers/assert";

type Fixtures = {
  /** Desktop viewport for CRM / customer desktop layouts */
  desktop: void;
  expectHealthy: typeof expectHealthyPage;
  gotoOk: typeof expectNoHttpFailure;
};

/**
 * Shared fixtures — import `{ test, expect }` from here in specs.
 */
export const test = base.extend<Fixtures>({
  desktop: [
    async ({ page }, use) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await use();
    },
    { auto: true },
  ],
  expectHealthy: async ({}, use) => {
    await use(expectHealthyPage);
  },
  gotoOk: async ({}, use) => {
    await use(expectNoHttpFailure);
  },
});

export { expect };
