import { test, expect } from "../fixtures";
import type { Page } from "@playwright/test";
import { NewOrderSheet } from "../pages/new-order.page";

test.describe.configure({ mode: "serial" });

// The queue pages client-side (10 a page, oldest first), so a fresh row can sit on a later page.
async function findQueueRow(page: Page, name: string) {
  const row = page.getByRole("row", { name: new RegExp(name) });
  for (let i = 0; i < 6 && !(await row.isVisible()); i++) {
    const next = page.getByRole("button", { name: "Next", exact: true });
    if (!(await next.isEnabled())) break;
    await next.click();
  }
  return row;
}

const toVerify = async (page: Page) =>
  Number((await page.getByRole("link", { name: /to verify/i }).locator("span.tabular-nums").first().textContent())?.trim() ?? NaN);

test.describe("staff overview: today queue", () => {
  const name = `E2E Overview ${Date.now()}`;

  test("a payment waiting to be verified shows in the queue and verifies in place", async ({ page }) => {
    test.setTimeout(180_000);

    const sheet = new NewOrderSheet(page);
    await sheet.open();
    const stamp = Date.now();
    await sheet.fillContact({ name, email: `e2e-overview-${stamp}@example.com`, phone: `416555${String(stamp).slice(-4)}` });
    await sheet.fillPlan();
    await sheet.goToPage2();
    await sheet.fillNewAddress();
    await sheet.payWith(/interac/i);
    await sheet.create();
    await sheet.expectCreated();

    await page.goto("/dashboard?type=payment");
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    const before = await toVerify(page);
    expect(before).toBeGreaterThan(0);

    const row = await findQueueRow(page, name);
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Verify" }).click();

    const dialog = page.getByRole("dialog", { name: /verify this payment/i });
    await expect(dialog.getByText(name)).toBeVisible();
    await dialog.getByRole("button", { name: "Verify payment" }).click();
    await expect(page.getByText("Payment verified")).toBeVisible({ timeout: 30_000 });

    await expect(page.getByRole("row", { name: new RegExp(name) })).toHaveCount(0, { timeout: 30_000 });
    await expect.poll(() => toVerify(page), { timeout: 30_000 }).toBe(before - 1);
  });
});
