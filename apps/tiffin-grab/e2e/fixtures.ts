import { test as base, expect } from "@playwright/test";
import path from "node:path";
import { expectHealthyPage, expectNoHttpFailure } from "./helpers/assert";
import { customerCreds } from "./helpers/auth";
import { NewOrderSheet } from "./pages/new-order.page";

type Fixtures = {
  /** Desktop viewport for CRM / customer desktop layouts */
  desktop: void;
  expectHealthy: typeof expectHealthyPage;
  gotoOk: typeof expectNoHttpFailure;
  /** publicId of a fresh unpaid Stripe payment for the customer user (needs STRIPE_E2E=1 and a connected sandbox). */
  unpaidStripePayment: string;
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
  unpaidStripePayment: async ({ browser }, use, testInfo) => {
    testInfo.skip(!process.env.STRIPE_E2E, "needs a connected Stripe sandbox + `stripe listen` forwarding");
    testInfo.setTimeout(180_000);
    const ctx = await browser.newContext({
      baseURL: testInfo.project.use.baseURL,
      storageState: path.join(__dirname, ".auth/admin.json"),
    });
    const page = await ctx.newPage();
    try {
      const sheet = new NewOrderSheet(page);
      await sheet.open();
      await sheet.fillContact({ name: "E2E Stripe", email: customerCreds().email, phone: `416555${String(Date.now()).slice(-4)}` });
      await sheet.fillPlan();
      await sheet.goToPage2();
      await sheet.fillNewAddress();
      await sheet.payWith(/^card$/i);
      await sheet.create();
      await sheet.expectCreated();
      await sheet.root.getByRole("button", { name: /view order/i }).click();
      await page.waitForURL(/\/dashboard\/orders\//);
      const id = (await page.getByTestId("payment-public-id").first().textContent({ timeout: 30_000 }))?.trim();
      if (!id) throw new Error("order detail did not render payment-public-id");
      await use(id);
    } finally {
      await ctx.close();
    }
  },
});

export { expect };
