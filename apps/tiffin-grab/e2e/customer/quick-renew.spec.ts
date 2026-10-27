import { test, expect } from "../fixtures";

/**
 * Quick renew: /me/renew is one prefilled Plan screen under the same single top bar as checkout;
 * "Continue" opens the Delivery step in place (same URL, no page load) with the default address picked,
 * the bar unmoved, and the total the customer saw is the total Delivery shows.
 * Runs as the seeded e2e customer, who must have a non-trial plan (`pnpm tsx scripts/reseed-e2e-users.ts`
 * plus a plan). Set E2E_RENEW_READY=1 once that holds; without it the spec skips with that reason.
 * With it set, a missing quick screen is a failure, never a skip.
 */
for (const [name, viewport] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]] as const) {
  test(`Quick renew: Plan to Delivery on one page (${name})`, async ({ page }) => {
    test.skip(!process.env.E2E_RENEW_READY, "set E2E_RENEW_READY=1 when the e2e customer has a non-trial plan to renew");
    await page.setViewportSize(viewport);
    await page.goto("/me/renew");
    const next = page.getByRole("button", { name: "Continue to checkout", exact: true });
    await expect(next, "quick renew screen did not render (stepper or error instead?)").toBeVisible({ timeout: 45_000 });

    await expect(page.getByTestId("plan-card")).toBeVisible();
    await expect(page.getByLabel("Start date")).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Commitment duration" })).toBeVisible();
    // One top bar only: the app's logo bar (cutoff, wallet) steps aside in the flow.
    await expect(page.locator("header.sticky")).toHaveCount(1);
    await expect(next).toBeEnabled({ timeout: 30_000 });
    const chip = page.getByRole("button", { name: /^Price summary/ });
    const seen = await chip.getAttribute("aria-label");
    const barBefore = await chip.boundingBox();

    await next.click();
    await expect(page).toHaveURL(/\/me\/renew$/);
    await expect(page.getByRole("heading", { name: /where should we deliver/i })).toBeVisible({ timeout: 45_000 });
    await expect(page.locator("header.sticky")).toHaveCount(1);
    await expect(page.getByRole("button", { name: seen! })).toBeVisible();
    expect(await page.getByRole("button", { name: /^Price summary/ }).boundingBox()).toEqual(barBefore);
  });
}
