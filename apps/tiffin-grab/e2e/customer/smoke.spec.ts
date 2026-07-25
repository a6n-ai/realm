import { test, expect } from "../fixtures";
import { CUSTOMER_ROUTES } from "./routes";

test.describe("customer feature smoke (desktop)", () => {
  for (const route of CUSTOMER_ROUTES) {
    test(`loads ${route.id} (${route.path})`, async ({ page, gotoOk, expectHealthy }) => {
      await gotoOk(page, route.path);
      // Guests redirect to login — session should keep us under /me
      await expect(page).toHaveURL(/\/me/, { timeout: 15_000 });
      await expectHealthy(page, route.heading);
    });
  }

  test("bottom/header nav reaches Finances and Deliveries", async ({ page, expectHealthy }) => {
    await page.goto("/me");
    // Prefer link text used in customer chrome
    const finances = page.getByRole("link", { name: /finance|wallet/i }).first();
    if (await finances.count()) {
      await finances.click();
      await expect(page).toHaveURL(/\/me\/wallet/);
      await expectHealthy(page, /finance|wallet|coin|bill/i);
    }

    await page.goto("/me/deliveries");
    await expectHealthy(page, /deliver/i);
  });
});
