import type { Page } from "@playwright/test";
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
