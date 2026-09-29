import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";

/** Admin `/dashboard/orders/[id]` — revamp layout. */
export class OrderDetailPage {
  constructor(readonly page: Page) {}

  section(title: string | RegExp): Locator {
    return this.page.getByRole("heading", { level: 2, name: title });
  }

  card(title: string | RegExp): Locator {
    return this.section(title).locator("xpath=ancestor::*[contains(@class,'rounded')][1]");
  }

  /** Tabs mount their panel only while selected, so open the tab before reading it. */
  async openTab(name: "Overview" | "Deliveries" | "Payments" | "Activity") {
    await this.page.getByRole("tab", { name: new RegExp(`^${name}`) }).click();
  }

  summaryCard(): Locator {
    return this.card("Customer & delivery");
  }

  paymentCard(): Locator {
    return this.card("Payments");
  }

  activitySection(): Locator {
    return this.card("Activity");
  }

  async expectRevampLayout() {
    for (const tab of ["Overview", "Deliveries", "Payments", "Activity"]) {
      await expect(this.page.getByRole("tab", { name: new RegExp(`^${tab}`) })).toBeVisible();
    }
    await expect(this.section("Plan & schedule")).toBeVisible();
    await expect(this.section("Customer & delivery")).toBeVisible();
    await expect(this.section("Pricing")).toBeVisible();
    await this.openTab("Deliveries");
    await expect(this.section("Deliveries")).toBeVisible();
    await expect(this.section("Routing")).toBeVisible();
    await expect(this.page.getByRole("tab", { name: /^Meals/ })).toHaveCount(0);
    await this.openTab("Payments");
    await expect(this.section("Payments")).toBeVisible();
    await this.openTab("Activity");
    await expect(this.section("Activity")).toBeVisible();
  }

  async expectSummaryAndPaymentCards() {
    await expect(this.card("Plan & schedule").getByText(/meal size/i)).toBeVisible();
    await expect(this.card("Pricing").getByText(/total/i).first()).toBeVisible();
    await this.openTab("Payments");
    await expect(this.paymentCard().getByText(/order total|received|payment records|no payments/i).first()).toBeVisible();
  }

  async expectDeliveriesCalendar() {
    await this.openTab("Deliveries");
    await expect(this.page.getByTestId("week-strip")).toBeVisible();
  }

  async expectActivityFilters() {
    await this.openTab("Activity");
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
