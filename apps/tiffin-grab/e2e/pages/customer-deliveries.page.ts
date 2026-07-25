import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";

/** Customer `/me/deliveries` calendar + day detail. */
export class CustomerDeliveriesPage {
  constructor(readonly page: Page) {}

  heading() {
    return this.page.getByRole("heading", { level: 1 });
  }

  stat(label: string | RegExp) {
    return this.page.getByText(label);
  }

  vacationButton() {
    return this.page.getByRole("button", { name: /vacation|resume/i });
  }

  calendarDay(iso: string) {
    return this.page.locator(`[data-date="${iso}"]`);
  }

  async expectCalendarShell() {
    await expect(this.heading()).toBeVisible();
    await expect(this.vacationButton()).toBeVisible();
    await expect(this.page.getByText(/total|delivered|remaining/i).first()).toBeVisible({ timeout: 15_000 });
  }

  async selectFirstDeliveryDay() {
    const scheduled = this.page.getByRole("button", { name: /scheduled|lunch|dinner|veg|non-veg/i }).first();
    if (await scheduled.count()) {
      await scheduled.click();
      return;
    }
    const today = this.page.getByRole("button", { name: /today/i }).first();
    if (await today.count()) {
      await today.click();
      return;
    }
    await this.page.locator("button[aria-pressed='true']").first().click();
  }

  dayAction(name: string | RegExp) {
    return this.page.getByRole("button", { name });
  }
}
