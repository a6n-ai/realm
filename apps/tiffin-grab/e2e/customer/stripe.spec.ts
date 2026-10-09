import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures";
import { fillCard } from "../helpers/stripe";

test.skip(!process.env.STRIPE_E2E, "needs a connected Stripe sandbox + `stripe listen` forwarding");

const paid = (page: Page) => page.getByText(/Paid, thank you/);

test("pays by card (debit, no surcharge) and settles via webhook", async ({ page, unpaidStripePayment }) => {
  await page.goto(`/me/pay/${unpaidStripePayment}`);
  await fillCard(page, "4000056655665556"); // Visa debit
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await expect(paid(page)).toBeVisible({ timeout: 30_000 });
});

test("credit card shows the surcharge before charging", async ({ page, unpaidStripePayment }) => {
  await page.goto(`/me/pay/${unpaidStripePayment}`);
  await fillCard(page, "4242424242424242");
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await expect(page.getByText(/card fee/)).toBeVisible();
  await page.getByRole("button", { name: /^Pay \$\d+\.\d\d$/ }).click();
  await expect(paid(page)).toBeVisible({ timeout: 30_000 });
});

test("3DS card completes after authentication", async ({ page, unpaidStripePayment }) => {
  await page.goto(`/me/pay/${unpaidStripePayment}`);
  await fillCard(page, "4000002760003184");
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  const challenge = page.frameLocator('iframe[name^="__privateStripeFrame"]').frameLocator("iframe").first();
  await challenge.getByRole("button", { name: /Complete/i }).click();
  await expect(page.getByText(/Paid, thank you|Payment is processing/)).toBeVisible({ timeout: 30_000 });
});

test("declined card shows an error and stays unpaid", async ({ page, unpaidStripePayment }) => {
  await page.goto(`/me/pay/${unpaidStripePayment}`);
  await fillCard(page, "4000000000000002");
  await page.getByRole("button", { name: /^Pay \$/ }).click();
  await expect(page.getByRole("alert")).toContainText(/declined/i);
  await expect(paid(page)).toHaveCount(0);
});
