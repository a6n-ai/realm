import { expect, test } from "../fixtures";

/**
 * Local smoke for Edit meal radios. Uses customer storage from setup-customer.
 * Local seed has a released menu for week 2026-09-28 (not the current calendar week).
 */
test("Edit meal shows per-slot radio options", async ({ page }) => {
  await page.goto("/me/deliveries?week=2026-09-28&trip=2026-09-28");
  await expect(page.getByRole("button", { name: /Edit meal/i }).first()).toBeVisible({ timeout: 45_000 });

  const edit = page.getByRole("button", { name: /Edit meal/i }).first();
  // Prefer an enabled Edit meal (menu released for that trip)
  if (await edit.isDisabled()) {
    // Fall back: click any enabled Edit meal on the page
    const enabled = page.getByRole("button", { name: /Edit meal/i }).filter({ hasNot: page.locator("[disabled], [aria-disabled=true]") });
    await expect(enabled.first()).toBeVisible({ timeout: 10_000 });
    await enabled.first().click();
  } else {
    await edit.click();
  }

  const sheet = page.getByRole("dialog", { name: /Edit meal/i });
  await expect(sheet).toBeVisible({ timeout: 20_000 });

  await expect(
    sheet.getByRole("radiogroup").or(sheet.getByText(/isn't out yet|Locked|Couldn't load|Default menu/i)).first(),
  ).toBeVisible({ timeout: 30_000 });

  const groups = sheet.getByRole("radiogroup");
  const groupCount = await groups.count();
  expect(await sheet.locator("select").count()).toBe(0);

  if (groupCount === 0) {
    await page.screenshot({ path: "e2e/.auth/edit-meal-smoke-no-radios.png", fullPage: true });
    throw new Error("Edit meal opened but no radiogroups — menu grid empty");
  }

  const radios = sheet.getByRole("radio");
  await expect(radios.first()).toBeVisible();
  expect(await radios.count()).toBeGreaterThan(0);

  // Spot-check portion labels on slot headers + exchange radios from admin pairs
  await expect(sheet.getByText("Sabzi · 8oz").first()).toBeVisible();
  await expect(sheet.getByRole("radio").first()).toBeVisible();
  // Swap destinations appear as radios (when valid), not buried in a <select>
  const exchange = sheet.getByRole("radio", { name: /Exchange/i });
  if ((await exchange.count()) > 0) {
    await expect(exchange.first()).toBeVisible();
  }

  await page.screenshot({ path: "e2e/.auth/edit-meal-smoke.png", fullPage: true });
});
