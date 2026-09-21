import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Customer `/me/deliveries`: plan header, trip timeline rows, action rail/bar and sheets. */
export class CustomerDeliveriesPage {
  constructor(readonly page: Page) {}

  heading() {
    return this.page.getByRole("heading", { level: 1, name: /trips/i });
  }

  tripRows() {
    return this.page.getByTestId("trip-row").filter({ visible: true });
  }

  vacationButton() {
    return this.page.getByRole("button", { name: /going away|on vacation/i }).first();
  }

  action(name: string | RegExp) {
    return this.page.getByRole("button", { name }).first();
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
