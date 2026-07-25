import { test, expect } from "../fixtures";
import { CustomerDeliveriesPage } from "../pages/customer-deliveries.page";

async function gotoDeliveries(page: import("@playwright/test").Page) {
  await page.goto("/me/deliveries", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/me\/deliveries/, { timeout: 30_000 });
  await expect(page.locator("body")).not.toContainText(/something went wrong/i);
  await expect(
    page
      .getByRole("heading", { name: /deliver/i })
      .or(page.getByText(/no active subscriptions/i))
      .first(),
  ).toBeVisible({ timeout: 30_000 });
}

test.describe("customer deliveries UX (desktop)", () => {
  test("deliveries page loads calendar or empty state", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoDeliveries(page);

    const hasPlan = await page.getByText(/^total$/i).count();
    if (hasPlan > 0) {
      await expect(page.getByText(/skips done/i)).toHaveCount(0);
      await expect(page.getByText(/^total$/i).first()).toBeVisible();
      await expect(page.getByText(/^remaining$/i).first()).toBeVisible();
    } else {
      await expect(page.getByText(/no active subscriptions/i)).toBeVisible();
    }
  });

  test("deliveries with active plan shows calendar controls", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoDeliveries(page);

    const hasPlan = await page.getByText(/^total$/i).count();
    test.skip(hasPlan === 0, "Seed customer has no active subscription — skip interactive calendar tests");

    const deliveries = new CustomerDeliveriesPage(page);
    await deliveries.expectCalendarShell();
    await deliveries.selectFirstDeliveryDay();

    const skip = deliveries.dayAction(/skip this day/i);
    const reschedule = deliveries.dayAction(/reschedule/i);
    const notScheduled = page.getByText(/not scheduled|menu for|locked|sealed/i);

    await expect(skip.or(reschedule).or(notScheduled).first()).toBeVisible({ timeout: 10_000 });
  });

  test("vacation control opens when a plan exists", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoDeliveries(page);

    const hasPlan = await page.getByRole("button", { name: /vacation|resume/i }).count();
    test.skip(hasPlan === 0, "Seed customer has no active subscription");

    const deliveries = new CustomerDeliveriesPage(page);
    await deliveries.vacationButton().click();

    await expect(
      page.getByRole("dialog").or(page.getByText(/pause|vacation|resume|start date/i)).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
