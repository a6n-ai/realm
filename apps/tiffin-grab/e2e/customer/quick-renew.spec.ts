import { test, expect } from "../fixtures";

/**
 * Quick renew: /me/renew is one prefilled screen, "Continue to pay" lands on checkout's Pay step,
 * and the total the customer saw is the total checkout charges.
 * Runs as the seeded e2e customer, who must have a non-trial plan (`pnpm tsx scripts/reseed-e2e-users.ts`
 * plus a plan). Set E2E_RENEW_READY=1 once that holds; without it the spec skips with that reason.
 * With it set, a missing quick screen is a failure, never a skip.
 */
for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
  test(`Quick renew: one screen to the Pay step (${name})`, async ({ page }) => {
    test.skip(!process.env.E2E_RENEW_READY, "set E2E_RENEW_READY=1 when the e2e customer has a non-trial plan to renew");
    await page.setViewportSize(viewport);
    await page.goto("/me/renew");
    const pay = page.getByRole("button", { name: /continue to pay/i });
    await expect(pay, "quick renew screen did not render (stepper or error instead?)").toBeVisible({ timeout: 45_000 });

    await expect(page.getByTestId("plan-card")).toBeVisible();
    await expect(page.getByLabel("Start date")).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Weeks" })).toBeVisible();
    await expect(pay).toBeEnabled({ timeout: 30_000 });
    const seen = await page.locator("[aria-label^='Total $']").getAttribute("aria-label");

    await pay.click();
    await expect(page).toHaveURL(/\/checkout/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /how would you\s+like to pay/i })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText(seen!.replace("Total ", ""), { exact: true }).first()).toBeVisible();
  });
}
