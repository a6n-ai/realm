import { test, expect } from "../fixtures";
import { NewOrderSheet } from "../pages/new-order.page";

const stamp = Date.now();
const phone = `416555${String(stamp).slice(-4)}`;
const email = `e2e-new-order-${stamp}@example.com`;
const name = "E2E New Order";

const money = async (loc: import("@playwright/test").Locator) =>
  Number(((await loc.textContent()) ?? "").replace(/[^0-9.]/g, ""));

test.describe.serial("admin New order sheet (desktop)", () => {
  test.setTimeout(150_000);
  let customerUrl = "";

  test("new customer order -> in-sheet Order created", async ({ page }) => {
    const sheet = new NewOrderSheet(page);
    await sheet.open();
    await sheet.fillContact({ name, phone, email });
    const meal = await sheet.fillPlan();
    await sheet.goToPage2();
    await sheet.fillNewAddress();
    await sheet.payWith(/interac/i);
    await sheet.create();
    await sheet.expectCreated();

    await expect(sheet.root.getByText(meal.replace(/ · Trial$/, "")).first()).toBeVisible();
    for (const row of ["Customer", "Meal", "Schedule", "Starts", "Delivery", "Payment"]) {
      await expect(sheet.root.locator("dt", { hasText: new RegExp(`^${row}$`) })).toBeVisible();
    }

    await sheet.root.getByRole("button", { name: /view order/i }).click();
    await page.waitForURL(/\/dashboard\/orders\/[^/]+$/, { timeout: 30_000 });
    await page.getByRole("link", { name: /customer profile/i }).click();
    await page.waitForURL(/\/dashboard\/customers\/[^/]+/);
    customerUrl = new URL(page.url()).pathname.split("/").slice(0, 4).join("/");
  });

  test("renewal: search customer, running plan preselected, saved address reused", async ({ page }) => {
    const sheet = new NewOrderSheet(page);
    await sheet.open();
    await sheet.pickCustomer(phone);

    const pill = sheet.root.locator('button[data-state="on"]', { hasText: /SUB-/ });
    await expect(pill).toBeVisible({ timeout: 30_000 });
    await expect(sheet.field("Meal size").locator('[role="radio"][data-state="on"]')).toHaveCount(1, { timeout: 15_000 });

    await sheet.goToPage2();
    await expect(sheet.root.getByRole("radiogroup", { name: "Saved addresses" }).getByRole("radio").first()).toBeChecked();
    await expect(sheet.root.getByRole("combobox", { name: "Street address" })).toHaveCount(0);

    await sheet.payWith(/interac/i);
    await sheet.create();
    await sheet.expectCreated();
  });

  test("coins: give 100, then Max on a new order lowers the total", async ({ page }) => {
    test.skip(!customerUrl, "needs the customer from the first test");
    await page.goto(customerUrl);
    await page.getByRole("button", { name: "Give or take coins" }).click();
    const dlg = page.getByRole("dialog", { name: /coins for/i });
    await dlg.getByRole("button", { name: "Give", exact: true }).click();
    await dlg.locator("#adjust-coins").fill("100");
    await dlg.locator("#adjust-memo").fill("e2e new-order coins");
    await dlg.getByRole("button", { name: "Save" }).click();
    await expect(dlg).toBeHidden({ timeout: 30_000 });

    const sheet = new NewOrderSheet(page);
    await sheet.open();
    await sheet.pickCustomer(phone);
    await expect(sheet.root.locator('button[data-state="on"]', { hasText: /SUB-/ })).toBeVisible({ timeout: 30_000 });
    await sheet.goToPage2();

    const total = sheet.root.getByText(/^Total$/).locator("xpath=following-sibling::span[1]");
    await expect(total).toHaveText(/\$\d/, { timeout: 15_000 });
    const before = await money(total);

    await sheet.openDiscounts();
    await sheet.root.getByRole("button", { name: "Max", exact: true }).first().click();
    await expect.poll(() => money(total), { timeout: 20_000 }).toBeLessThan(before);

    await sheet.payWith(/interac/i);
    await sheet.create();
    await sheet.expectCreated();
    await expect(sheet.root.getByText(/Coins \(/)).toBeVisible();
  });
});
