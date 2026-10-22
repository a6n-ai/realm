import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Customer `/me`: plan line, week strip (the day picker), the selected day's delivery block, its actions (inline on desktop, sticky bar on mobile) and sheets. */
export class CustomerDeliveriesPage {
  constructor(readonly page: Page) {}

  heading() {
    return this.page.getByRole("heading", { level: 1 });
  }

  /** Days in the strip you eat on. */
  tripRows() {
    return this.strip().getByRole("button", { name: /, eating,/ });
  }

  strip() {
    return this.page.getByTestId("week-timeline");
  }

  deliveryBlock() {
    return this.page.getByTestId("delivery-block");
  }

  planChips() {
    return this.page.getByRole("group", { name: "Filter by plan" }).getByRole("button");
  }

  pauseButton() {
    return this.page.getByRole("button", { name: "Pause or resume days", exact: true }).filter({ visible: true }).first();
  }

  action(name: string | RegExp) {
    return this.page.getByRole("button", { name }).filter({ visible: true }).first();
  }

  sheet(title: string | RegExp) {
    return this.page.getByRole("dialog", { name: title });
  }

  /** The Pause drawer, open and loaded. */
  async openPause() {
    await this.pauseButton().click();
    const sheet = this.sheet(/pause deliveries/i);
    await expect(sheet).toBeVisible({ timeout: 10_000 });
    await expect(sheet.getByText("Loading deliveries.")).toHaveCount(0);
    await expect(sheet.getByRole("region").first().or(sheet.getByText(/can be paused/))).toBeVisible({ timeout: 15_000 });
    return sheet;
  }

  /** The drawer says every pause (or pause day) is used; a pause cannot start. */
  limitReachedIn(sheet: Locator) {
    return sheet.getByText(/You've used all your pause/).isVisible();
  }

  /** Opens the drawer, reads the limit notice, closes it again. */
  async pauseLimitReached() {
    const sheet = await this.openPause();
    const reached = await this.limitReachedIn(sheet);
    await this.page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    return reached;
  }

  /** Delivery days on the drawer's month grid that can still be picked to pause. */
  upcomingRows(sheet: Locator) {
    return sheet.getByRole("group").getByRole("button", { name: /^\w{3}, \w{3} \d+$/ });
  }

  /** Paused days still before cutoff; a tap marks one to resume, the footer button saves. */
  pausedRows(sheet: Locator) {
    return sheet.getByRole("group").getByRole("button", { name: /, paused$/ });
  }

  /** Marks paused day `i` and saves; the drawer closes. */
  async resumeOne(sheet: Locator, i = 0) {
    await this.pausedRows(sheet).nth(i).click();
    await sheet.getByRole("button", { name: "Resume this delivery" }).click();
  }

  /** Picks the first `n` upcoming days in the open drawer and confirms. Returns their labels. */
  async pauseFirst(n: number) {
    const sheet = await this.openPause();
    const rows = this.upcomingRows(sheet);
    const labels: string[] = [];
    for (let i = 0; i < n; i++) {
      labels.push((await rows.nth(i).getAttribute("aria-label")) ?? "");
      await rows.nth(i).click();
    }
    await sheet.getByRole("button", { name: n > 1 ? `Pause ${n} deliveries` : "Pause this delivery" }).click();
    await expect(sheet).toBeHidden({ timeout: 20_000 });
    return labels;
  }

  /** Leaves the plan as found: every paused day put back. */
  async resumeEverything() {
    const sheet = await this.openPause();
    const all = sheet.getByRole("button", { name: "Resume all" });
    if (await all.isVisible()) await all.click();
    else if ((await this.pausedRows(sheet).count()) > 0) await this.resumeOne(sheet);
    else return this.page.keyboard.press("Escape");
    await expect(sheet).toBeHidden({ timeout: 20_000 });
  }

  pausedDays() {
    return this.strip().getByRole("button", { name: /, eating, Paused/ });
  }

  async expectShell() {
    await expect(this.heading()).toBeVisible();
    await expect(this.page.getByText(/tiffins left/i).first()).toBeVisible({ timeout: 15_000 });
  }

  async selectFirstTrip() {
    await this.tripRows().first().click();
  }
}
