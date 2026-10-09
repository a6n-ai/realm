import path from "node:path";
import { test, expect } from "../fixtures";
import { fillCard } from "../helpers/stripe";

test.skip(
  !process.env.STRIPE_E2E || !process.env.STRIPE_E2E_NO_WEBHOOK,
  "needs STRIPE_E2E=1 and webhook forwarding STOPPED (kill `stripe listen`) so the paid charge is unknown here",
);

test("reconcile settles a card payment the webhook missed", async ({ page, browser, unpaidStripePayment }) => {
  const ctx = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: path.join(__dirname, "../.auth/customer.json"),
  });
  const customer = await ctx.newPage();
  await customer.goto(`/me/pay/${unpaidStripePayment}`);
  await fillCard(customer, "4000056655665556");
  await customer.getByRole("button", { name: /^Pay \$/ }).click();
  await customer.waitForTimeout(8_000); // charge succeeds in Stripe; no webhook reaches us
  await ctx.close();

  await page.goto("/dashboard/payments/stripe");
  await page.getByRole("button", { name: /Reconcile with Stripe/ }).click();
  const dialog = page.getByRole("dialog", { name: /Reconcile with Stripe/ });
  await dialog.getByRole("button", { name: "Run" }).click();
  await dialog.getByRole("button", { name: "Settle" }).first().click();
  await expect(dialog.getByText("Paid in Stripe, unpaid here")).toHaveCount(0, { timeout: 15_000 });
});
