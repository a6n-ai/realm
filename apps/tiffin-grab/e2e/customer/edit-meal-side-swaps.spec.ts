import { expect, test } from "../fixtures";

/**
 * Fixed sides get radios when admin swap pairs start from that category.
 * QA order is pointed at Maharaja (rice/roti/raita/salad/daal) for this smoke;
 * week 2026-09-28 is released; Tue Sep 29 is scheduled.
 */
test("Edit meal shows swap radios on fixed side categories from admin pairs", async ({ page }) => {
  await page.goto("/me?week=2026-09-28&trip=2026-09-29");
  await expect(page.getByRole("heading", { name: /Hi,/i })).toBeVisible({ timeout: 45_000 });

  const tue = page.getByRole("button", { name: /Tuesday, September 29/i });
  if (await tue.count()) await tue.first().click();

  const edit = page.getByRole("button", { name: /Edit meal/i }).first();
  await expect(edit).toBeVisible({ timeout: 20_000 });
  await expect(edit).toBeEnabled();
  await edit.click();

  const sheet = page.getByRole("dialog", { name: /Edit meal/i });
  await expect(sheet).toBeVisible({ timeout: 20_000 });
  await expect(sheet.getByRole("radiogroup").first()).toBeVisible({ timeout: 30_000 });

  // Selectable + fixed-from-admin pairs should be radiogroups
  for (const name of [/Sabzi/i, /Rice/i, /Roti/i, /Salad/i, /Daal/i]) {
    await expect(sheet.getByRole("radiogroup", { name }).first()).toBeVisible({ timeout: 10_000 });
  }

  // Raita is only a TO target → Included, no radiogroup
  await expect(sheet.getByText("Included").first()).toBeVisible();
  const raitaRadios = sheet.getByRole("radiogroup", { name: /^Raita/i });
  await expect(raitaRadios).toHaveCount(0);

  // Exchange radios from admin pairs (rice→roti, daal→…, salad→raita, …)
  const exchanges = sheet.getByRole("radio", { name: /(Choose this instead|Exchange)/i });
  await expect(exchanges.first()).toBeVisible({ timeout: 10_000 });
  expect(await exchanges.count()).toBeGreaterThanOrEqual(2);

  await page.screenshot({ path: "e2e/.auth/edit-meal-side-swaps.png", fullPage: true });
});
