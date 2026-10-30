import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";

/** Desktop DateInput (popover calendar): opens it and picks the earliest selectable day, which is `min`. */
export async function pickEarliestDate(page: Page, trigger: Locator) {
  await trigger.click();
  await page.locator('[data-slot="popover-content"] button[data-day]:not([disabled])').first().click();
}

/** Admin CRM left sidebar (desktop). */
export class AdminShell {
  constructor(readonly page: Page) {}

  private sidebar(): Locator {
    // Desktop + mobile sheet both mount; prefer the visible rail.
    return this.page.locator('[data-sidebar="sidebar"]').locator("visible=true").first();
  }

  link(name: string | RegExp): Locator {
    // A string matches the label at the start of the name: nav links append badge text ("Inquiries New activity").
    const pattern = typeof name === "string" ? new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`) : name;
    return this.sidebar().getByRole("link", { name: pattern });
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

  addInquiry() {
    return this.root.getByRole("button", { name: /add inquiry/i });
  }
}
