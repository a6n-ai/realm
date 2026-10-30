import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Admin "New order" right sheet: page 1 (customer + plan), page 2 (delivery & payment), then the in-sheet "Order created" panel. */
export class NewOrderSheet {
  readonly root: Locator;

  constructor(readonly page: Page) {
    this.root = page.getByRole("dialog", { name: /new order|order created/i });
  }

  async open() {
    await this.page.goto("/dashboard/orders");
    await this.page.getByRole("button", { name: /^new order$/i }).first().click();
    await expect(this.root.getByText("Customer", { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  }

  /** A form Field: the wrapper that holds a <label> with this exact text. */
  field(label: string): Locator {
    return this.root.locator("div.grid.gap-1\\.5").filter({ has: this.page.locator("label", { hasText: new RegExp(`^${label}$`) }) });
  }

  continueBtn() {
    return this.root.getByRole("button", { name: /^continue$/i });
  }

  createBtn() {
    return this.root.getByRole("button", { name: /^create order$/i });
  }

  async fillContact(o: { name: string; phone: string; email: string; source?: string }) {
    await this.root.getByPlaceholder("e.g. Priya Sharma").fill(o.name);
    const tel = this.root.locator('input[type="tel"]').first();
    await expect(tel).toBeVisible({ timeout: 10_000 });
    await tel.click();
    await tel.fill("");
    await tel.pressSequentially(o.phone, { delay: 20 });
    await this.root.locator('input[type="email"]').fill(o.email);
    await this.field("Source").getByRole("radio", { name: o.source ?? "Manual" }).click();
  }

  /** Picks an existing customer through the search combobox (by phone digits). */
  async pickCustomer(query: string) {
    await this.root.getByPlaceholder(/search existing customer/i).fill(query);
    await this.root.getByRole("option").first().click({ timeout: 15_000 });
  }

  /** First diet, first non-trial meal size, first quick-pick start day. Returns the meal size label chosen. */
  async fillPlan(): Promise<string> {
    await this.field("Diet").getByRole("radio").first().click();
    const meal = this.field("Meal size").getByRole("radio").filter({ hasNotText: /Trial/ }).first();
    await expect(meal).toBeVisible({ timeout: 15_000 });
    const label = (await meal.getAttribute("aria-label")) ?? "";
    await meal.click();
    await this.field("Start date").getByRole("radio").first().click();
    return label;
  }

  async goToPage2() {
    await expect(this.continueBtn()).toBeEnabled({ timeout: 15_000 });
    await this.continueBtn().click();
    await expect(this.root.getByRole("button", { name: /^back$/i })).toBeVisible();
  }

  async fillNewAddress(o = { line: "123 Test St", city: "Toronto", postal: "M5H 2N2" }) {
    const newAddr = this.root.getByRole("radio", { name: /new address/i });
    if (await newAddr.count()) await newAddr.click();
    await this.root.getByRole("combobox", { name: "Street address" }).fill(o.line);
    await this.root.getByRole("textbox", { name: "City" }).fill(o.city);
    await this.root.getByRole("textbox", { name: "Postal code" }).fill(o.postal);
  }

  async payWith(method: RegExp = /interac/i) {
    await this.root.getByRole("radio", { name: method }).click();
  }

  async openDiscounts() {
    await this.root.getByRole("button", { name: /^Discounts/ }).click();
  }

  async create() {
    await expect(this.createBtn()).toBeEnabled({ timeout: 30_000 });
    await this.createBtn().click();
  }

  async expectCreated() {
    await expect(this.root.getByRole("heading", { name: /order created/i }).or(this.root.getByText("Order created"))).toBeVisible({ timeout: 90_000 });
    await expect(this.root.getByText(/SUB-[A-Z0-9]+/).first()).toBeVisible();
    await expect(this.root.getByRole("button", { name: /copy whatsapp message/i })).toBeVisible();
  }
}
