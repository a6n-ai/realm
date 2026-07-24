import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Customer `/me` chrome (header / bottom nav on desktop+mobile). */
export class CustomerShell {
  constructor(readonly page: Page) {}

  async gotoHome() {
    await this.page.goto("/me");
  }

  async go(name: string | RegExp) {
    await this.page.getByRole("link", { name }).first().click();
  }

  async expectOnMe() {
    await expect(this.page).toHaveURL(/\/me/);
  }
}
