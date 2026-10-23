import { test, expect } from "../fixtures";

/**
 * Staff renew: Renew on an order opens one sheet, "Create renewal" makes the next plan and shows
 * the pay-link dialog, and the same order then no longer offers Renew (a renewal exists).
 * Creates one order in the target database, like the other order-creating specs.
 */
test("Staff renews an order and the order stops offering Renew", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/dashboard/orders");
  await expect(page.locator("a[href*='/dashboard/orders/ord_']").first()).toBeVisible({ timeout: 60_000 });
  const hrefs = await page.locator("a[href*='/dashboard/orders/ord_']").evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute("href")!))].slice(0, 15));

  const renew = page.getByRole("button", { name: /^Renew$/ });
  let orderHref: string | null = null;
  for (const href of hrefs) {
    await page.goto(href);
    await expect(page.getByRole("tab", { name: /^Overview/ })).toBeVisible({ timeout: 45_000 });
    if (await renew.isVisible()) { orderHref = href; break; }
  }
  test.skip(!orderHref, "no renewable order in the first 15 orders");

  await renew.click();
  const sheet = page.getByRole("dialog", { name: /Renew plan/i });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Start date")).toBeVisible({ timeout: 30_000 });
  const create = sheet.getByRole("button", { name: "Create renewal" });
  await expect(create).toBeEnabled({ timeout: 30_000 });
  await create.click();

  const done = page.getByRole("dialog", { name: /Order created/i });
  await expect(done).toBeVisible({ timeout: 60_000 });
  await expect(done.getByRole("button", { name: /copy link|email payment link/i }).first()).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto(orderHref!);
  await expect(page.getByRole("tab", { name: /^Overview/ })).toBeVisible({ timeout: 45_000 });
  await expect(renew).toHaveCount(0);
});
