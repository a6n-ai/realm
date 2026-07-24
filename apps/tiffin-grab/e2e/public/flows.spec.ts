import { test, expect } from "../fixtures";
import { LoginPage } from "../pages/login.page";

test.describe("public interactive flows", () => {
  test("login password mode is available", async ({ page }) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.expectPasswordForm();
  });

  test("subscribe wizard loads a step", async ({ page, expectHealthy }) => {
    await page.goto("/subscribe");
    await expect(page.locator("body")).not.toContainText(/something went wrong/i);
    // Wizard may use h1 or step labels
    const anyHeading = page.getByRole("heading").first();
    if (await anyHeading.count()) {
      await expect(anyHeading).toBeVisible();
    } else {
      await expectHealthy(page, /subscribe|plan|meal|order|tiffin/i);
    }
  });

  test("checkout page loads without crash", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page.locator("body")).not.toContainText(/something went wrong|application error/i);
  });
});
