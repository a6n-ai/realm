import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Customer `/me`: plan line, eating-day rows for the selected week, week strip, selected-trip card actions (inline on desktop, sticky bar on mobile) and sheets. */
export class CustomerDeliveriesPage {
  constructor(readonly page: Page) {}

  heading() {
    return this.page.getByRole("heading", { level: 1, name: /trips/i });
  }

  tripRows() {
    return this.page.getByTestId("trip-row").filter({ visible: true });
  }

  strip() {
    return this.page.getByTestId("week-strip");
  }

  planChips() {
    return this.page.getByRole("group", { name: "Filter by plan" }).getByRole("button");
  }

  vacationButton() {
    return this.page.getByRole("button", { name: /going away|vacation/i }).filter({ visible: true }).first();
  }

  action(name: string | RegExp) {
    return this.page.getByRole("button", { name }).filter({ visible: true }).first();
  }

  sheet(title: string | RegExp) {
    return this.page.getByRole("dialog", { name: title });
  }

  async expectShell() {
    await expect(this.heading()).toBeVisible();
    await expect(this.page.getByText(/tiffins left/i).first()).toBeVisible({ timeout: 15_000 });
  }

  async selectFirstTrip() {
    await this.tripRows().first().click();
  }
}
