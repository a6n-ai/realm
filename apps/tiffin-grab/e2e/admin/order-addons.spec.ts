import path from "node:path";
import type { Browser, Page } from "@playwright/test";
import { test, expect } from "../fixtures";
import { LeadSheet } from "../pages/admin.shell";
import { OrderDetailPage } from "../pages/order-detail.page";

const adminState = path.join(process.cwd(), "e2e/.auth/admin.json");

/** Flips the e-Transfer switch through Settings > Payments; returns the state it found. */
async function setEtransfer(browser: Browser, baseURL: string | undefined, on: boolean) {
  const ctx = await browser.newContext({ baseURL, storageState: adminState });
  try {
    const page = await ctx.newPage();
    await page.goto("/dashboard/settings/payments/etransfer");
    const toggle = page.getByRole("switch").first();
    await expect(toggle).toBeVisible({ timeout: 60_000 });
    const was = (await toggle.getAttribute("aria-checked")) === "true";
    if (was !== on) {
      await toggle.click();
      if (on) {
        const payee = page.getByPlaceholder("pay@yourbrand.ca");
        if (!(await payee.inputValue())) await payee.fill("pay@test.invalid");
      }
      await page.getByRole("button", { name: /^Save / }).first().click();
      await expect(page.getByRole("button", { name: /^Save / }).first()).toBeEnabled({ timeout: 30_000 });
      await page.reload();
      await expect(page.getByRole("switch").first()).toHaveAttribute("aria-checked", String(on), { timeout: 30_000 });
    }
    return was;
  } finally {
    await ctx.close();
  }
}

const proofPath = path.join(__dirname, "../fixtures/payment-proof.png");

/** Creates an order through the New Order sheet as already paid, so the plan is active with a settled payment. */
async function openPaidActiveOrder(page: Page) {
  await page.goto("/dashboard/orders");
  await page.getByRole("button", { name: /new order/i }).click();

  const sheet = new LeadSheet(page);
  await sheet.expectOpen();
  const stamp = Date.now();
  await sheet.fillContact({
    name: "E2E Addons",
    email: `e2e-addons-${stamp}@example.com`,
    phone: `416555${String(stamp).slice(-4)}`,
  });
  await sheet.continue().click();

  const root = sheet.root;
  await root.getByRole("radio", { name: /^veg$/i }).first().click();
  await root.getByRole("radio").filter({ hasText: /regular|large|thali/i }).first().click();
  const dateInput = root.locator('input[type="date"]').first();
  await dateInput.fill((await dateInput.getAttribute("min")) ?? "2099-01-06");
  await root.getByRole("button", { name: /continue to payment/i }).click();

  await root.getByRole("combobox", { name: "Street address" }).fill("123 Test St");
  await root.getByRole("textbox", { name: "City" }).fill("Toronto");
  await root.getByRole("textbox", { name: "Postal code" }).fill("M5H 2N2");

  await root.getByRole("button", { name: /e-?transfer|interac/i }).first().click();
  // "Already paid" with a screenshot approves the payment on create, so the plan starts active and settled.
  await root.getByRole("radio", { name: /^Already paid/ }).click();
  await root.locator('input[type="file"]').setInputFiles(proofPath);
  await root.getByRole("button", { name: /^create order$/i }).click();

  await expect(root.getByText("Order created")).toBeVisible({ timeout: 90_000 });
  await root.getByRole("button", { name: /view order/i }).click();
  await page.waitForURL(/\/dashboard\/orders\/[^/]+$/);

  const detail = new OrderDetailPage(page);
  await detail.openTab("Payments");
  await expect(detail.paymentCard().getByText("Paid", { exact: true })).toHaveCount(1);
  await detail.openTab("Overview");
  return detail;
}

test.describe("admin mid-plan add-ons (desktop)", () => {
  test.describe.configure({ mode: "serial" });
  let etransferWasOn = true;

  // A real payment method must be on for the order page to offer add-ons; restore it afterwards.
  test.beforeAll(async ({ browser }) => {
    etransferWasOn = await setEtransfer(browser, test.info().project.use.baseURL, true);
  });

  test.afterAll(async ({ browser }) => {
    if (etransferWasOn) return;
    try {
      await setEtransfer(browser, test.info().project.use.baseURL, false);
    } catch (e) {
      console.error("!!! RESTORE FAILED: e-Transfer is still ENABLED in Settings > Payments. Disable it by hand.", e);
      throw e;
    }
  });

  test("staff add an add-on and record its payment without holding the plan", async ({ page }) => {
    test.setTimeout(180_000);
    const detail = await openPaidActiveOrder(page);

    await expect(page.getByRole("button", { name: "Change plan" })).toHaveCount(0);
    const pricing = detail.card("Pricing");
    const totalBefore = await pricing.innerText();

    await page.getByRole("button", { name: "Add-ons" }).click();
    const dialog = page.getByRole("dialog", { name: "Add add-ons to this plan" });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("button", { name: /^More / }).first().click();
    const quote = dialog.getByLabel("Add-on quote");
    await expect(quote).toBeVisible();
    await expect(quote.getByText("To collect")).toBeVisible();

    await dialog.locator('input[type="file"]').setInputFiles(proofPath);
    await dialog.getByRole("button", { name: /^Add and record / }).click();
    await expect(dialog).toBeHidden({ timeout: 45_000 });

    // The top-up is settled, so the plan never shows as waiting on payment.
    await expect(page.getByText(/payment review/i)).toHaveCount(0);
    await expect(pricing).not.toHaveText(totalBefore);

    await detail.openTab("Payments");
    await expect(detail.paymentCard().getByText("Paid", { exact: true })).toHaveCount(2);
    await expect(detail.paymentCard().getByText(/awaiting|pending/i)).toHaveCount(0);

    await detail.openTab("Activity");
    await expect(page.getByText(/Add-ons added for the remaining \d+ tiffins/).first()).toBeVisible();

    await detail.openTab("Deliveries");
    const block = page.getByTestId("delivery-block");
    await expect(block).toBeVisible();
    if (await block.getByText("Menu not released yet").count()) {
      test.info().annotations.push({ type: "skipped-assertion", description: "no released menu for the selected day; add-on tiles not asserted" });
    } else {
      await expect(block.getByText("Add-ons", { exact: true })).toBeVisible();
    }
  });
});
