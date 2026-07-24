import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";

/** Admin CRM left sidebar (desktop). */
export class AdminShell {
  constructor(readonly page: Page) {}

  private sidebar(): Locator {
    // Desktop + mobile sheet both mount; prefer the visible rail.
    return this.page.locator('[data-sidebar="sidebar"]').locator("visible=true").first();
  }

  link(name: string | RegExp): Locator {
    const exact = typeof name === "string";
    return this.sidebar().getByRole("link", { name, exact });
  }

  async expectNav() {
    await expect(this.link("Overview")).toBeVisible();
    await expect(this.link("Inquiries")).toBeVisible();
    await expect(this.link("Settings")).toBeVisible();
  }

  async go(name: string | RegExp) {
    await this.link(name).click();
    await this.page.waitForLoadState("domcontentloaded");
  }
}

/** ResponsiveDialog / Drawer sheet used for New inquiry / order / customer. */
export class LeadSheet {
  readonly root: Locator;

  constructor(readonly page: Page) {
    this.root = page.getByRole("dialog");
  }

  async expectOpen() {
    await expect(this.root).toBeVisible();
  }

  continue() {
    return this.root.getByRole("button", { name: /continue/i });
  }

  async fillContact(opts: { name: string; email: string; phone?: string }) {
    await this.root.getByPlaceholder(/priya|e\.g\./i).first().fill(opts.name);
    await this.root.locator('input[type="email"]').fill(opts.email);
    if (opts.phone) {
      const tel = this.root.locator('input[type="tel"]').first();
      await expect(tel).toBeVisible({ timeout: 10_000 });
      await tel.click();
      await tel.fill("");
      await tel.pressSequentially(opts.phone, { delay: 20 });
      await tel.blur();
    }
  }

  /** Step 2 order form — plan, address, payment method. */
  async fillMinimalOrder(opts?: { startDate?: string }) {
    await expect(this.root.getByRole("radio", { name: /^veg$/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    await this.root.getByRole("radio", { name: /^veg$/i }).first().click();
    const mealPill = this.root
      .getByRole("radio")
      .filter({ hasText: /regular|standard|medium|small|large|thali/i })
      .first();
    if (await mealPill.count()) {
      await mealPill.click();
    }

    const dateInput = this.root.locator('input[type="date"]').first();
    await expect(dateInput).toBeVisible();
    const min = await dateInput.getAttribute("min");
    await dateInput.fill(opts?.startDate ?? min ?? "2099-01-06");

    await this.root.getByLabel(/^address/i).fill("123 Test St");
    await this.root.getByLabel(/^city/i).fill("Toronto");

    const delivery = this.root.locator("fieldset").filter({ hasText: "Delivery" });
    const postalCombo = delivery.getByRole("combobox");
    await postalCombo.click();
    const search = this.page.getByPlaceholder(/type a postal code/i);
    await expect(search).toBeVisible({ timeout: 5_000 });
    await search.fill("M5H 2N2");
    await this.page.keyboard.press("Escape");

    const payMethod = this.root.getByRole("button").filter({ hasText: /interac|e-transfer|cash/i }).first();
    if (await payMethod.count()) {
      await payMethod.click();
    }
  }

  submitOrder() {
    return this.root.getByRole("button", { name: /^create order$/i });
  }

  addInquiry() {
    return this.root.getByRole("button", { name: /add inquiry/i });
  }
}
