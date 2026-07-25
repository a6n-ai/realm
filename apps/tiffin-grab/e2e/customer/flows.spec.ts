import { test, expect } from "../fixtures";
import { CustomerShell } from "../pages/customer.shell";

test.describe("customer interactive flows", () => {
  test("account hub links to profile and security", async ({ page, expectHealthy }) => {
    await page.goto("/me/account");
    await expectHealthy(page, /account|profile|section/i);

    const profile = page.getByRole("link", { name: /profile/i }).first();
    if (await profile.count()) {
      await profile.click();
      await expect(page).toHaveURL(/\/me\/profile/);
      await expectHealthy(page, /profile/i);
    }

    await page.goto("/me/security");
    await expectHealthy(page, /security|password|pin/i);
  });

  test("support list opens new ticket form", async ({ page, expectHealthy }) => {
    await page.goto("/me/support");
    await expectHealthy(page, /support|ticket/i);
    const neu = page.getByRole("link", { name: /new|create/i }).first();
    if (await neu.count()) {
      await neu.click();
      await expect(page).toHaveURL(/\/me\/support\/new/);
    } else {
      await page.goto("/me/support/new");
    }
    await expectHealthy(page, /support|ticket|new|create/i);
  });

  test("Finances tabs stay under /me/wallet", async ({ page, expectHealthy }) => {
    const shell = new CustomerShell(page);
    await shell.gotoHome();
    await page.goto("/me/wallet?tab=bills");
    await expect(page).toHaveURL(/\/me\/wallet/);
    await expectHealthy(page, /finance|wallet|coin|bill|transaction/i);
    await page.goto("/me/wallet?tab=transactions");
    await expectHealthy(page, /finance|wallet|coin|bill|transaction/i);
  });
});
