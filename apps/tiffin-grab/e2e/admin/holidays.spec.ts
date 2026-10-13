import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test } from "../fixtures";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(Date.parse(`${s}T00:00:00Z`) + n * 86_400_000));
const LONG = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
const longDate = (s: string) => LONG.format(new Date(`${s}T00:00:00Z`));
const mondayOf = (s: string) => addDays(s, -((new Date(`${s}T00:00:00Z`).getUTCDay() + 6) % 7));
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The ISO date a strip label names ("Monday, November 9, eating, ..."), or null when it is outside the asked week: the strip clamps weeks past the plan to its last week. */
function labelDate(label: string, monday: string): string | null {
  const [, month, day] = label.match(/^\w+, (\w+) (\d+)/)!;
  const m = String(MONTHS.indexOf(month!) + 1).padStart(2, "0");
  for (const year of [Number(monday.slice(0, 4)), Number(monday.slice(0, 4)) + 1]) {
    const d = `${year}-${m}-${day!.padStart(2, "0")}`;
    if (d >= monday && d <= addDays(monday, 6)) return d;
  }
  return null;
}

/** Dates of the days in one week of the customer's strip whose label matches `pattern`. */
async function stripDates(page: Page, monday: string, pattern: RegExp): Promise<string[]> {
  await page.goto(`/me?week=${monday}`);
  const strip = page.getByTestId("week-timeline");
  await expect(strip).toBeVisible({ timeout: 45_000 });
  const labels = await strip.locator("button[aria-pressed]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  return labels.filter((l) => pattern.test(l)).flatMap((l) => labelDate(l, monday) ?? []);
}

/** Every eating day in the 30 weeks from `fromMonday` (a fixed horizon: the strip clamps weeks past the plan). */
async function eatingDays(page: Page, fromMonday: string): Promise<string[]> {
  const out = new Set<string>();
  for (let w = 0; w < 30; w++) for (const d of await stripDates(page, addDays(fromMonday, 7 * w), /, eating,/)) out.add(d);
  return [...out].sort();
}

/** Upcoming eating days from two weeks out: Remove is refused once a day's cutoff has passed, so never pick a near one. */
async function upcomingDays(page: Page): Promise<{ date: string; monday: string }[]> {
  const first = addDays(mondayOf(iso(new Date())), 14);
  const found: { date: string; monday: string }[] = [];
  for (let w = 0; w < 8 && found.length < 2; w++) {
    const monday = addDays(first, 7 * w);
    for (const date of await stripDates(page, monday, /, eating, Upcoming.*delivery arrives/)) if (!found.some((f) => f.date === date)) found.push({ date, monday });
  }
  return found;
}

test("declare a holiday: kitchen closed for staff, closed day with its extra day for the customer, rename, removable", async ({ page, browser, baseURL }) => {
  test.setTimeout(300_000);
  const NAME = `E2E Holiday ${Date.now() % 1_000_000}`;
  const RENAMED = `${NAME} Renamed`;
  const customerCtx = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, storageState: path.join(process.cwd(), "e2e/.auth/customer.json") });
  const customer = await customerCtx.newPage();
  let declared = false;

  const tiffinsLeft = async () => (await customer.getByText(/\d+ of \d+ tiffins left/).first().innerText()).match(/\d+ of \d+ tiffins left/)![0];

  const remove = async () => {
    await page.goto("/dashboard/holidays");
    const row = page.getByRole("row").filter({ hasText: /E2E Holiday \d+/ }).first();
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByRole("button", { name: "Remove" }).click();
    await page.getByRole("button", { name: "Remove holiday" }).click();
    await expect(page.getByText(/Holiday removed\./)).toBeVisible({ timeout: 20_000 });
    declared = false;
  };

  try {
    const [target, other] = await upcomingDays(customer);
    expect(target && other, "the QA customer needs two upcoming deliveries two or more weeks out").toBeTruthy();
    const { date, monday } = target;
    const planBefore = await eatingDays(customer, monday);
    await customer.goto(`/me?week=${monday}&trip=${date}`);
    const before = await tiffinsLeft();

    // 1. Staff reach the page from the sidebar and declare.
    await page.goto("/dashboard");
    await page.getByRole("link", { name: "Holidays" }).first().click();
    await expect(page).toHaveURL(/\/dashboard\/holidays/);
    await page.getByRole("button", { name: "Declare holiday" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Date").fill(date);
    await dialog.getByLabel("Name").fill(NAME);
    // Off: the run must not put a real email in the outbox.
    await dialog.getByLabel("Notify customers").click();
    await dialog.getByRole("button", { name: "Declare holiday" }).click();
    declared = true;

    // 2. The result says how many deliveries were closed; the holiday is listed.
    await expect(page.getByText(/Holiday saved\. [1-9]\d* deliver(y|ies) closed, \d+ added back at the end of the plan\./)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("row").filter({ hasText: NAME })).toBeVisible();

    // 3. Labels and Dispatch say the kitchen is closed; the customer has no label that day.
    await page.goto(`/dashboard/labels?date=${date}`);
    await expect(page.getByTestId("holiday-banner")).toContainText(`Holiday: ${NAME}. Kitchen closed.`, { timeout: 45_000 });
    await expect(page.getByText("QA Customer")).toHaveCount(0);
    await page.goto(`/dashboard/dispatch?date=${date}`);
    await expect(page.getByTestId("holiday-banner")).toContainText(`Holiday: ${NAME}`, { timeout: 45_000 });

    // 4. The customer: Holiday as visible text, where the tiffin went, nothing to change.
    await customer.goto(`/me?week=${monday}&trip=${date}`);
    const strip = customer.getByTestId("week-timeline");
    await expect(strip.getByRole("button", { name: new RegExp(`${longDate(date)}, eating, Holiday: ${NAME}`) })).toBeVisible({ timeout: 45_000 });
    const block = customer.getByTestId("delivery-block");
    await expect(block).toContainText("Holiday");
    await expect(block.getByText(`Holiday: ${NAME}`)).toBeVisible();
    await expect(block.getByText(/^Added at the end of the plan: /)).toBeVisible();
    await expect(block.getByText(/Out to /)).toHaveCount(0);
    await expect(customer.getByRole("button", { name: /^(Move|Swap|Pick)\b/ }).filter({ visible: true })).toHaveCount(0);
    expect(await tiffinsLeft()).toBe(before);

    const planAfter = await eatingDays(customer, monday);
    expect(planAfter.length).toBe(planBefore.length + 1);
    const extra = planAfter.find((d) => !planBefore.includes(d));
    expect(extra && extra > planBefore.at(-1)!, "the extra day sits after the plan's old last day").toBeTruthy();

    await customer.goto(`/me?week=${other.monday}&trip=${other.date}`);
    await customer.getByRole("button", { name: "What the colours mean" }).first().click();
    await expect(customer.getByText("Holiday", { exact: true }).last()).toBeVisible();
    await customer.keyboard.press("Escape");

    // The Move sheet for another day never offers the holiday date.
    await customer.getByRole("button", { name: /^Move$|Move to another day/ }).filter({ visible: true }).first().click();
    const sheet = customer.getByRole("dialog", { name: /Move /i });
    await expect(sheet).toBeVisible({ timeout: 15_000 });
    const holidayButton = sheet.getByRole("button", { name: new RegExp(longDate(date)) });
    for (let i = 0; i < 4 && !(await holidayButton.count()); i++) await sheet.getByRole("button", { name: "Next week" }).first().click();
    await expect(holidayButton.first()).toBeDisabled();
    await customer.keyboard.press("Escape");

    // 5. Rename: the customer sees the new name.
    await page.goto("/dashboard/holidays");
    await page.getByRole("row").filter({ hasText: NAME }).getByRole("button", { name: "Rename" }).click();
    const renameDialog = page.getByRole("dialog");
    await renameDialog.getByLabel("Name").fill(RENAMED);
    await renameDialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Holiday renamed")).toBeVisible({ timeout: 20_000 });
    await customer.goto(`/me?week=${monday}&trip=${date}`);
    await expect(customer.getByTestId("delivery-block").getByText(`Holiday: ${RENAMED}`)).toBeVisible({ timeout: 45_000 });

    // 6. Remove: the day is ordinary again and the extra day is gone.
    await remove();
    await customer.goto(`/me?week=${monday}&trip=${date}`);
    await expect(strip.getByRole("button", { name: new RegExp(`${longDate(date)}, eating, Upcoming`) })).toBeVisible({ timeout: 45_000 });
    await expect(customer.getByText(/Holiday:/)).toHaveCount(0);
    expect(await tiffinsLeft()).toBe(before);
    expect(await eatingDays(customer, monday)).toEqual(planBefore);
  } finally {
    if (declared) await remove().catch(() => {});
    await customerCtx.close();
  }
});
