// What the pause flows below cannot undo through the UI (no database cleanup is done on purpose):
//  - every pause action stays in the pause log, so it keeps counting against the plan's maxPauses
//    even after Resume (Resume only refunds the days). On a plan with a pause limit these tests
//    skip once the limit is used up instead of failing.
//  - "paused" and "resumed" activities stay on the order's activity log.
//  - a pause deletes the day's OptimoRoute stop; Resume does not re-create it unless that date was
//    already pushed (then the server pushes the one stop back).
//  Each test resumes whatever it paused in a finally block, so the plan's days end up as found.
// The server-side cutoff filter of the pause drawer is covered by the listPauseDays service test,
// not here: the page cannot show a day it was never offered.
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

  test("pause sheet opens", async ({ page }) => {
    test.setTimeout(90_000);
    await gotoDeliveries(page);
    test.skip((await hasPlan(page)) === 0, "Seed customer has no active subscription");
    const d = new CustomerDeliveriesPage(page);
    await d.pauseButton().click();
    await expect(d.sheet(/pause deliveries/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /on hold|release hold/i })).toHaveCount(0);
  });

  test.describe("pause before cutoff", () => {
    test.describe.configure({ mode: "serial" });

    test("pause the next delivery, it reads Paused, Resume this day puts it back", async ({ page }) => {
      test.setTimeout(120_000);
      await gotoDeliveries(page);
      test.skip((await hasPlan(page)) === 0, "Seed customer has no active subscription");
      const d = new CustomerDeliveriesPage(page);
      let failure: unknown;
      test.skip(await d.pauseLimitReached(), "Pause limit used up on the seed plan (pauses stay in the log)");
      try {
        await d.pauseFirst(1);
        await expect(page.getByText(/^Paused \w{3}\.$/)).toBeVisible({ timeout: 15_000 });
        await expect(d.pausedDays()).toHaveCount(1, { timeout: 15_000 });
        await expect(page.getByTestId("plan-summary")).toContainText("Active");
        await d.pausedDays().first().click();
        await expect(d.deliveryBlock()).toContainText("Paused");
        await d.action("Resume this day").click();
        await expect(page.getByText(/\w{3} is back on\./)).toBeVisible({ timeout: 15_000 });
        await expect(d.pausedDays()).toHaveCount(0, { timeout: 15_000 });
      } catch (err) {
        failure = err;
        throw err;
      } finally {
        await d.resumeEverything().catch((err) => { if (!failure) throw err; });
      }
    });

    test("pause three days, resume the middle one, then Resume all; the plan stays active", async ({ page }) => {
      test.setTimeout(180_000);
      await gotoDeliveries(page);
      test.skip((await hasPlan(page)) === 0, "Seed customer has no active subscription");
      const d = new CustomerDeliveriesPage(page);
      let failure: unknown;
      try {
        const sheet0 = await d.openPause();
        test.skip(await d.limitReachedIn(sheet0), "Pause limit used up on the seed plan (pauses stay in the log)");
        test.skip((await d.upcomingRows(sheet0).count()) < 3, "Fewer than three pausable days");
        await page.keyboard.press("Escape");
        await expect(sheet0).toBeHidden();

        const labels = await d.pauseFirst(3);
        await expect(page.getByTestId("plan-summary")).toContainText("Active");

        let sheet = await d.openPause();
        await expect(d.pausedRows(sheet)).toHaveCount(3);
        await d.pausedRows(sheet).nth(1).click();
        await expect(sheet).toBeHidden({ timeout: 20_000 });
        await expect(page.getByText(/\w{3} is back on\./)).toBeVisible({ timeout: 15_000 });

        sheet = await d.openPause();
        await expect(d.pausedRows(sheet)).toHaveCount(2);
        await expect(d.upcomingRows(sheet).filter({ hasText: labels[1]! })).toHaveCount(1);
        await sheet.getByRole("button", { name: "Resume all" }).click();
        await expect(sheet).toBeHidden({ timeout: 20_000 });
        await expect(d.pausedDays()).toHaveCount(0, { timeout: 15_000 });
        await expect(page.getByTestId("plan-summary")).toContainText("Active");
      } catch (err) {
        failure = err;
        throw err;
      } finally {
        await d.resumeEverything().catch((err) => { if (!failure) throw err; });
      }
    });

    test("a trial plan has no Pause", async ({ page }) => {
      await gotoDeliveries(page);
      test.skip((await page.getByText(/^Trial$/).count()) === 0, "Seed customer is not on a trial");
      await expect(new CustomerDeliveriesPage(page).pauseButton()).toBeHidden();
    });
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
    await sheet.getByRole("button", { name: "Save" }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByText("Meals saved")).toBeVisible();
  });

  test("legacy /me/meals redirects into the pick sheet", async ({ page }) => {
    await page.goto("/me/meals?date=2026-01-05", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/me\?action=pick&trip=2026-01-05/, { timeout: 30_000 });
  });
});
