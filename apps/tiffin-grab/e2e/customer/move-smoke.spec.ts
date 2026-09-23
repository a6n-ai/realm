import { expect, test } from "../fixtures";

/**
 * Move a delivery to a free plan weekday and confirm:
 * - old date reads "Moved" (source skipped → makeup)
 * - new date shows as Make-up on that calendar day
 */
test("moving a trip shows on the new date and not the old", async ({ page }) => {
  const fromDate = "2026-09-28"; // Mon
  // Free weekday after the seeded block (seed fills through Oct 6)
  const toDate = "2026-10-07"; // Wed

  await page.goto(`/me?week=${fromDate}&trip=${fromDate}`);
  await expect(page.getByRole("heading", { name: /Hi,/i })).toBeVisible({ timeout: 45_000 });

  const moveBtn = page.getByRole("button", { name: /^Move$/i }).or(page.getByRole("button", { name: /Move to another day/i })).first();
  await expect(moveBtn).toBeVisible({ timeout: 20_000 });

  const fromDay = page.getByRole("button", { name: /Monday, September 28/i });
  if (await fromDay.count()) await fromDay.first().click();

  await moveBtn.click();

  const sheet = page.getByRole("dialog", { name: /Move /i });
  await expect(sheet).toBeVisible({ timeout: 15_000 });

  for (let i = 0; i < 4; i++) {
    const target = sheet.getByRole("button", { name: /Wednesday, October 7/i });
    if (await target.count()) {
      await target.first().click();
      break;
    }
    await sheet.getByRole("button", { name: "Next week" }).first().click();
  }

  const confirm = sheet.getByRole("button", { name: /Move to Wed, Oct 7/i });
  await expect(confirm).toBeEnabled({ timeout: 10_000 });
  await confirm.click();
  await expect(sheet).toBeHidden({ timeout: 20_000 });

  // Old date: source trip is Moved (not a normal Upcoming eating day)
  await page.goto(`/me?week=${fromDate}&trip=${fromDate}`);
  const oldTrip = page.getByTestId("trip-row").filter({ hasText: /Mon,\s*Sep\s*28/i });
  await expect(oldTrip.first()).toBeVisible({ timeout: 20_000 });
  await expect(oldTrip.first()).toContainText(/Moved/i);
  await expect(oldTrip.first()).not.toContainText(/Upcoming/i);

  // New date: make-up arrives Oct 7
  await page.goto(`/me?week=2026-10-05&trip=${toDate}`);
  const newTrip = page.getByTestId("trip-row").filter({ hasText: /Wed,\s*Oct\s*7/i });
  await expect(newTrip.first()).toBeVisible({ timeout: 20_000 });
  await expect(newTrip.first()).toContainText(/Make-up/i);
  await expect(page.getByText(/Arrives Wed, Oct 7/i).first()).toBeVisible();

  await page.screenshot({ path: "e2e/.auth/move-smoke.png", fullPage: true });
});
