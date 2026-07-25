import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";

/** Admin `/dashboard/orders/[id]` — revamp layout. */
export class OrderDetailPage {
  constructor(readonly page: Page) {}

  section(title: string | RegExp): Locator {
    return this.page.getByRole("heading", { level: 2, name: title });
  }

  summaryCard(): Locator {
    return this.section("Summary").locator("xpath=ancestor::*[contains(@class,'rounded')][1]");
  }

  paymentCard(): Locator {
    return this.section("Payment").locator("xpath=ancestor::*[contains(@class,'rounded')][1]");
  }

  activitySection(): Locator {
    return this.section("Activity").locator("xpath=ancestor::*[contains(@class,'rounded')][1]");
  }

  async expectRevampLayout() {
    await expect(this.section("Summary")).toBeVisible();
    await expect(this.section("Payment")).toBeVisible();
    await expect(this.section("Deliveries")).toBeVisible();
    await expect(this.section(/This week's meals/i)).toBeVisible();
    await expect(this.section("Activity")).toBeVisible();

    // Old CRM panels removed.
    await expect(this.section("Lifecycle")).toHaveCount(0);
    await expect(this.section("Tiffins")).toHaveCount(0);
    await expect(this.section("Payments")).toHaveCount(0);
  }

  async expectSummaryAndPaymentCards() {
    await expect(this.summaryCard().getByText(/plan|schedule|address|deployment|pricing/i).first()).toBeVisible();
    await expect(this.summaryCard().getByText(/total/i).first()).toBeVisible();
    await expect(this.paymentCard().getByText(/order total|received|payment records|no payments/i).first()).toBeVisible();
  }

  async expectDeliveriesCalendar() {
    await expect(this.page.getByRole("button", { name: /vacation|resume/i })).toBeVisible();
    await expect(this.page.getByText(/month calendar|vacation pause|deliveries/i).first()).toBeVisible();
  }

  async expectActivityFilters() {
    const activity = this.activitySection();
    await expect(activity.getByPlaceholder(/search activity/i)).toBeVisible();
    // Reui facet filter control (same as orders list).
    await expect(activity.getByRole("button", { name: /filter|add filter/i }).first()).toBeVisible();
  }

  activityPaginationRange() {
    return this.activitySection().getByText(/\d+–\d+ of \d+/);
  }

  copyPayLink() {
    return this.page.getByRole("button", { name: /copy pay link/i });
  }
}
