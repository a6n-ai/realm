import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";

/** Admin `/dashboard/orders/[id]` — revamp layout. */
export class OrderDetailPage {
  constructor(readonly page: Page) {}

  section(title: string | RegExp): Locator {
    return this.page.getByRole("heading", { level: 2, name: title });
  }

  async expectRevampLayout() {
    await expect(this.section("Summary")).toBeVisible();
    await expect(this.section("Payments")).toBeVisible();
    await expect(this.section("Deliveries")).toBeVisible();
    await expect(this.section(/This week's meals/i)).toBeVisible();
    await expect(this.section("Activity")).toBeVisible();

    // Old CRM panels removed.
    await expect(this.section("Lifecycle")).toHaveCount(0);
    await expect(this.section("Tiffins")).toHaveCount(0);
  }

  async expectDeliveriesCalendar() {
    await expect(this.page.getByRole("button", { name: /vacation|resume/i })).toBeVisible();
    await expect(this.page.getByText(/same calendar|month calendar|vacation pause/i).first()).toBeVisible();
  }

  copyPayLink() {
    return this.page.getByRole("button", { name: /copy pay link/i });
  }
}
