import { test, expect } from "../fixtures";
import { CustomerDeliveriesPage } from "../pages/customer-deliveries.page";

async function gotoDeliveries(page: import("@playwright/test").Page) {
  await page.goto("/me", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/me\/?(\?|$)/, { timeout: 30_000 });
  await expect(page.locator("body")).not.toContainText(/something went wrong/i);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
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

  test("week strip is visible on desktop and shows a delivery marker", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoDeliveries(page);
    test.skip((await hasPlan(page)) === 0, "Seed customer has no active subscription");
    const d = new CustomerDeliveriesPage(page);
    await expect(d.strip()).toBeVisible();
    await expect(d.strip().getByRole("button", { name: /delivery arrives/ }).first()).toBeVisible();
  });

  test("next arrow changes ?week and the list is scoped to that week", async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoDeliveries(page);
    test.skip((await hasPlan(page)) === 0, "Seed customer has no active subscription");
    const next = page.getByRole("button", { name: "Next week" });
    test.skip(!(await next.isEnabled()), "Only one week of deliveries");
    await next.click();
    await expect(page).toHaveURL(/week=\d{4}-\d{2}-\d{2}/, { timeout: 15_000 });
    await expect(page.getByRole("button", { name: /Show earlier|Show more|See all/ })).toHaveCount(0);
  });

  test("a bad ?week is ignored and old ?month links still load", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/me?week=garbage&month=2026-10", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
  });

  test("vacation sheet opens", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoDeliveries(page);
    test.skip((await hasPlan(page)) === 0, "Seed customer has no active subscription");
    const d = new CustomerDeliveriesPage(page);
    await d.vacationButton().click();
    await expect(d.sheet(/pause deliveries|resume deliveries/i)).toBeVisible({ timeout: 10_000 });
  });

  test("move, swap and pick sheets open from the trip actions", async ({ page }) => {
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
      await page.getByRole("button", { name: "Close", exact: true }).click();
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

  test("pick meals sheet lists dishes and saves a choice", async ({ page }) => {
    test.setTimeout(120_000);
    await gotoDeliveries(page);
    test.skip((await hasPlan(page)) === 0, "Seed customer has no active subscription");
    const d = new CustomerDeliveriesPage(page);
    test.skip((await d.tripRows().count()) === 0, "No eating days in the selected week");
    await d.selectFirstTrip();
    const b = d.action(/pick meals/i);
    test.skip(!(await b.isVisible()) || !(await b.isEnabled()), "First trip is past its cutoff");
    await b.click();
    const sheet = d.sheet(/pick meals/i);
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    const tiles = sheet.locator("[aria-pressed=false]");
    const empty = sheet.getByText(/isn.t out yet/i);
    await expect(tiles.first().or(empty)).toBeVisible({ timeout: 30_000 });
    test.skip((await empty.count()) > 0, "No released menu for the first trip");
    await tiles.first().click();
    // The pick is optimistic in the sheet but "Meals saved" only fires once the server action returns (it re-renders every plan); Done before that closes silently.
    await page.waitForTimeout(4_000);
    await expect(sheet.getByRole("button", { name: "Apply to the whole week" }).first()).toBeVisible({ timeout: 10_000 });
    await sheet.getByRole("button", { name: "Done" }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByText("Meals saved")).toBeVisible();
  });

  test("legacy /me/meals redirects into the pick sheet", async ({ page }) => {
    await page.goto("/me/meals?date=2026-01-05", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/me\?action=pick&trip=2026-01-05/, { timeout: 30_000 });
  });
});
