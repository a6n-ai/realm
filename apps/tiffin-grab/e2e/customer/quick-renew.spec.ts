import { test, expect } from "../fixtures";

/**
 * Quick renew: /me/renew is one prefilled screen, "Continue to pay" lands on checkout's Pay step,
 * and the total the customer saw is the total checkout charges.
 * Needs a customer whose latest non-trial plan has eating days; otherwise the page shows the
 * full stepper, and the spec skips instead of failing.
 */
for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
  test(`Quick renew: one screen to the Pay step (${name})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/me/renew");
    const pay = page.getByRole("button", { name: /continue to pay/i });
    const quick = await pay.waitFor({ timeout: 45_000 }).then(() => true, () => false);
    test.skip(!quick, "customer has no one-tap renewable plan; /me/renew shows the stepper");

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
