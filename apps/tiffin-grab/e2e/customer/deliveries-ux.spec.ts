import { test, expect } from "../fixtures";
import { CustomerDeliveriesPage } from "../pages/customer-deliveries.page";

async function gotoDeliveries(page: import("@playwright/test").Page) {
  await page.goto("/me/deliveries", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/me\/deliveries/, { timeout: 30_000 });
  await expect(page.locator("body")).not.toContainText(/something went wrong/i);
  await expect(page.getByRole("heading", { level: 1, name: /trips/i })).toBeVisible({ timeout: 30_000 });
}

const hasPlan = (page: import("@playwright/test").Page) => page.getByText(/tiffins left/i).count();

test.describe("customer deliveries (trip timeline)", () => {
  test("loads plan header or the no-plan state", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoDeliveries(page);
    if ((await hasPlan(page)) > 0) {
      await new CustomerDeliveriesPage(page).expectShell();
      await expect(page.getByText(/skips done/i)).toHaveCount(0);
    }
  });

  test("selecting a trip shows its actions or a closed reason", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoDeliveries(page);
    test.skip((await hasPlan(page)) === 0, "Seed customer has no active subscription");
    const d = new CustomerDeliveriesPage(page);
    await d.selectFirstTrip();
    await expect(
      d.action(/hold this trip|resume this trip|swap items/i).or(page.getByRole("status")).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("vacation sheet opens", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoDeliveries(page);
    test.skip((await hasPlan(page)) === 0, "Seed customer has no active subscription");
    const d = new CustomerDeliveriesPage(page);
    await d.vacationButton().click();
    await expect(d.sheet(/pause deliveries|resume deliveries/i)).toBeVisible({ timeout: 10_000 });
  });

  test("hold, move, swap and pick sheets open from the rail", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoDeliveries(page);
    test.skip((await hasPlan(page)) === 0, "Seed customer has no active subscription");
    const d = new CustomerDeliveriesPage(page);
    await d.selectFirstTrip();
    const cases: [RegExp, RegExp][] = [
      [/hold this trip/i, /^hold /i],
      [/move to another day/i, /^move /i],
      [/swap items/i, /swap items/i],
      [/pick meals/i, /pick meals/i],
    ];
    for (const [btn, title] of cases) {
      const b = d.action(btn);
      if (!(await b.isVisible()) || !(await b.isEnabled())) continue;
      await b.click();
      await expect(d.sheet(title)).toBeVisible({ timeout: 10_000 });
      await page.getByRole("button", { name: "Close" }).click();
      await expect(d.sheet(title)).toBeHidden();
    }
  });

  test("make-up sheet opens (carried-day trip flow)", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoDeliveries(page);
    test.skip((await hasPlan(page)) === 0, "Seed customer has no active subscription");
    const b = page.getByRole("button", { name: "Schedule a make-up" });
    test.skip((await b.count()) === 0, "No make-up owed for the seed customer");
    await b.click();
    await expect(page.getByRole("dialog", { name: /schedule a make-up/i })).toBeVisible();
  });
});
