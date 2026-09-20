import { test, expect, type Page } from "@playwright/test";

const MEAL = "4 Item Thali — Regular";
const FIRST_LOAD = { timeout: 90_000 };

const email = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
const pill = (page: Page, d: string) => page.getByRole("button", { name: d, exact: true });
const next = (page: Page) => page.getByRole("button", { name: "Next", exact: true });
const chip = (page: Page) => page.getByRole("button", { name: /^Price summary:/ });

async function startWizard(page: Page) {
  await page.goto("/subscribe");
  await page.getByLabel("Email").fill(email());
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("button", { name: /Non-Veg Plan/ })).toBeVisible(FIRST_LOAD);
}

async function toBundle(page: Page) {
  await startWizard(page);
  await page.getByRole("button", { name: /Pure Vegetarian Plan/ }).click();
  await next(page).click();
  await expect(page.getByRole("button", { name: new RegExp(MEAL) })).toBeVisible();
}

async function toSchedule(page: Page) {
  await toBundle(page);
  await page.getByRole("button", { name: new RegExp(MEAL) }).click();
  await next(page).click();
  await expect(page.getByRole("heading", { name: "Which days do you eat?" })).toBeVisible();
}

async function toDuration(page: Page) {
  await toSchedule(page);
  await next(page).click();
  await expect(page.getByText("Commitment duration")).toBeVisible();
}

test.describe("subscribe -> checkout journey", () => {
  test("schedule step: defaults, min bound, live count, trip preview, apply/undo tip", async ({ page }) => {
    await toSchedule(page);

    const three = page.getByRole("button", { name: /3 days/ });
    const five = page.getByRole("button", { name: /5 days/ });
    await expect(five).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Pick 3 to 7 days")).toBeVisible();
    await expect(page.getByText(/5\s*tiffins a week/).first()).toBeVisible();
    for (const d of ["Mon", "Tue", "Wed", "Thu", "Fri"]) await expect(pill(page, d)).toHaveAttribute("aria-pressed", "true");
    for (const d of ["Sat", "Sun"]) await expect(pill(page, d)).toHaveAttribute("aria-pressed", "false");
    await expect(chip(page)).toContainText("$60.00");

    await pill(page, "Sat").click();
    await expect(page.getByText(/6\s*tiffins a week/).first()).toBeVisible();
    await pill(page, "Sat").click();
    await expect(page.getByText(/5\s*tiffins a week/).first()).toBeVisible();

    await pill(page, "Thu").click();
    await pill(page, "Fri").click();
    await expect(page.getByText(/3\s*tiffins a week/).first()).toBeVisible();
    for (const d of ["Mon", "Tue", "Wed"]) await expect(pill(page, d)).toBeDisabled();
    await expect(page.getByText("Pick 3 to 7 days")).toBeVisible();
    await pill(page, "Thu").click();
    await pill(page, "Fri").click();
    await expect(page.getByText(/5\s*tiffins a week/).first()).toBeVisible();

    await expect(three).toContainText("Save 10%");
    await expect(chip(page)).toContainText("$60.00");
    const tip = page.getByRole("region", { name: "Tip for your delivery" });
    await expect(tip).toContainText("Select 3-day delivery to save 10% on every tiffin.");
    await tip.getByRole("button", { name: "Use this" }).click();
    const applied = page.getByRole("region", { name: "Applied" });
    await expect(applied).toBeVisible();
    await expect(three).toHaveAttribute("aria-pressed", "true");
    await expect(chip(page)).toContainText("5 tiffins");
    await expect(chip(page)).toContainText("$54.00");
    for (const d of ["Mon", "Tue", "Wed", "Thu", "Fri"]) await expect(pill(page, d)).toHaveAttribute("aria-pressed", "true");
    const preview = page.getByRole("list", { name: "Delivery preview" });
    await expect(preview).toContainText(/Mon\s*2 tiffins/);
    await expect(preview).toContainText(/Wed\s*2 tiffins/);
    await expect(preview).toContainText(/Fri\s*1 tiffin/);
    await applied.getByRole("button", { name: "Undo" }).click();
    await expect(chip(page)).toContainText("$60.00");
    await expect(page.getByRole("region", { name: "Tip for your delivery" })).toBeVisible();
  });

  test("disabled Next explains what is missing on Baseline and Bundle", async ({ page }) => {
    await startWizard(page);
    await expect(next(page)).toBeDisabled();
    await expect(page.getByText("Choose a baseline plan to continue.")).toBeVisible();
    await page.getByRole("button", { name: /Pure Vegetarian Plan/ }).click();
    await expect(next(page)).toBeEnabled();
    await next(page).click();
    await expect(next(page)).toBeDisabled();
    await expect(page.getByText("Pick a meal size to continue.")).toBeVisible();
    await page.getByRole("button", { name: new RegExp(MEAL) }).click();
    await expect(next(page)).toBeEnabled();
  });

  test("start date is pre-filled and Continue to checkout shows the plan", async ({ page }) => {
    await toDuration(page);
    await expect(page.getByText("Start date", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Save \d+%/).first()).toBeVisible();
    const go = page.getByRole("button", { name: "Continue to checkout" });
    await expect(go).toBeEnabled();
    await go.click();
    await page.waitForURL(/\/checkout/, FIRST_LOAD);
    await expect(page.getByText(MEAL).locator("visible=true").first()).toBeVisible(FIRST_LOAD);
    await expect(page.getByText(/5\s*tiffins a week/).locator("visible=true").first()).toBeVisible();
  });

  test("Edit plan returns to the wizard with selection intact", async ({ page }) => {
    await toDuration(page);
    await page.getByRole("button", { name: "Continue to checkout" }).click();
    await page.waitForURL(/\/checkout/, FIRST_LOAD);
    await page.getByRole("button", { name: "Edit plan" }).first().click();
    await page.waitForURL(/\/subscribe/, FIRST_LOAD);
    await expect(page.getByLabel("Email")).toHaveCount(0);
    await expect(page.getByText("Commitment duration")).toBeVisible();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(pill(page, "Mon")).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByRole("button", { name: new RegExp(MEAL) })).toHaveAttribute("aria-pressed", "true");

  });

  test("checkout: Not you returns to the email step", async ({ page }) => {
    await toDuration(page);
    await page.getByRole("button", { name: "Continue to checkout" }).click();
    await page.waitForURL(/\/checkout/, FIRST_LOAD);
    await page.getByRole("button", { name: /Not you\? Use a different email/ }).click();
    await expect(page.getByLabel("Email")).toBeVisible();
  });

  test.describe("phone width", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("Back lives in the bottom bar, no horizontal overflow", async ({ page }) => {
      await toSchedule(page);
      const backs = page.getByRole("button", { name: "Back", exact: true });
      await expect(backs).toHaveCount(1);
      const box = await backs.boundingBox();
      expect(box!.y).toBeGreaterThan(844 / 2);
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
        .toBeLessThanOrEqual(0);
    });
  });
});
