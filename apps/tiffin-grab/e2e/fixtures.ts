import { test as base, expect } from "@playwright/test";
import path from "node:path";
import { expectHealthyPage, expectNoHttpFailure } from "./helpers/assert";
import { customerCreds } from "./helpers/auth";
import { LeadSheet } from "./pages/admin.shell";

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
      await page.goto("/dashboard/orders");
      await page.getByRole("button", { name: /new order/i }).click();
      const sheet = new LeadSheet(page);
      await sheet.expectOpen();
      await sheet.fillContact({ name: "E2E Stripe", email: customerCreds().email, phone: `416555${String(Date.now()).slice(-4)}` });
      await sheet.continue().click();
      await sheet.fillMinimalOrder();
      await sheet.root.getByRole("button").filter({ hasText: /card|stripe/i }).first().click();
      await sheet.reviewOrder().click();
      await sheet.submitOrder().click();
      await page.getByRole("dialog", { name: /order created/i }).getByRole("button", { name: /view order/i }).click({ timeout: 90_000 });
      await page.waitForURL(/\/dashboard\/orders\//);
      const html = await page.content();
      const id = /\/me\/pay\/([A-Za-z0-9_-]+)/.exec(html)?.[1];
      if (!id) throw new Error("order detail did not expose a /me/pay/<paymentId> link; update unpaidStripePayment");
      await use(id);
    } finally {
      await ctx.close();
    }
  },
});

export { expect };
