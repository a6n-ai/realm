import type { Page, Locator } from "@playwright/test";
import { expect } from "@playwright/test";
import type { Creds } from "../helpers/auth";

export class LoginPage {
  constructor(readonly page: Page) {}

  async goto() {
    await this.page.goto("/login");
  }

  async switchToPassword() {
    const switchBtn = this.page.getByRole("button", { name: /sign in with a password instead/i });
    if (await switchBtn.isVisible().catch(() => false)) {
      await switchBtn.click();
    }
  }

  email(): Locator {
    return this.page.getByLabel(/^email$/i);
  }

  password(): Locator {
    return this.page.getByLabel(/^password$/i);
  }

  submit(): Locator {
    return this.page.getByRole("button", { name: /^sign in$/i });
  }

  async loginWithPassword(creds: Creds, landed: RegExp) {
    await this.goto();
    await this.switchToPassword();
    await this.email().fill(creds.email);
    await this.password().fill(creds.password);
    await Promise.all([
      this.page.waitForURL(landed, { timeout: 45_000 }),
      this.submit().click(),
    ]);
  }

  async expectPasswordForm() {
    await this.switchToPassword();
    await expect(this.email()).toBeVisible();
    await expect(this.password()).toBeVisible();
  }
}
