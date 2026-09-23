import { expect, test } from "../fixtures";

/**
 * After customer Move (Sep 28 → Oct 7), admin Daily labels must:
 * - drop the customer from the old date packing sheet
 * - include them on the new date packing sheet
 */
test("daily labels follow a moved delivery to the new date", async ({ page }) => {
  const fromDate = "2026-09-28";
  const toDate = "2026-10-07";

  await page.goto(`/dashboard/labels?date=${fromDate}`);
  await expect(page.getByRole("heading", { name: /Daily labels/i })).toBeVisible({ timeout: 45_000 });
  // Old date: moved source is skipped — QA must not appear on the packing sheet
  await expect(page.getByText(/QA Customer/i)).toHaveCount(0);

  await page.goto(`/dashboard/labels?date=${toDate}`);
  await expect(page.getByRole("heading", { name: /Daily labels/i })).toBeVisible({ timeout: 45_000 });
  // New date: make-up delivery is scheduled — QA appears on the packing sheet
  await expect(page.getByText(/QA Customer/i).first()).toBeVisible({ timeout: 20_000 });

  await page.screenshot({ path: "e2e/.auth/labels-after-move.png", fullPage: true });
});
