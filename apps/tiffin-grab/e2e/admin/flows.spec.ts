import { test, expect } from "../fixtures";
import { AdminShell, LeadSheet } from "../pages/admin.shell";

test.describe("admin interactive flows (desktop)", () => {
  test("sidebar exposes primary hub links", async ({ page }) => {
    await page.goto("/dashboard");
    const shell = new AdminShell(page);
    await shell.expectNav();
    await expect(shell.link("Inquiries")).toHaveAttribute("href", "/dashboard/inquiries");
    await expect(shell.link("Orders")).toHaveAttribute("href", "/dashboard/orders");
    await expect(shell.link("Settings")).toHaveAttribute("href", "/dashboard/settings");
  });

  test("New inquiry: Contact → Interest, email required, diet before meals", async ({ page }) => {
    await page.goto("/dashboard/inquiries");
    await page.getByRole("button", { name: /new inquiry/i }).click();

    const sheet = new LeadSheet(page);
    await sheet.expectOpen();
    await expect(sheet.continue()).toBeDisabled();

    // Unique CA mobile so we don't collide with existing customers / soft-match.
    const phone = `416555${String(Date.now()).slice(-4)}`;
    await sheet.fillContact({
      name: "E2E Inquiry",
      email: `e2e-inquiry-${Date.now()}@example.com`,
      phone,
    });
    await expect(sheet.continue()).toBeEnabled({ timeout: 15_000 });
    await sheet.continue().click();

    await expect(sheet.root.getByText(/interest|diet/i).first()).toBeVisible();
    await expect(sheet.root.getByRole("radio", { name: /veg/i }).first()).toBeVisible();
  });

  test("New order opens Contact step with source pills", async ({ page }) => {
    await page.goto("/dashboard/orders");
    await page.getByRole("button", { name: /new order/i }).click();

    const sheet = new LeadSheet(page);
    await sheet.expectOpen();
    await expect(sheet.root.getByRole("radio", { name: /manual/i })).toBeVisible();
    await expect(sheet.continue()).toBeDisabled();
  });

  test("New customer requires email before save", async ({ page }) => {
    await page.goto("/dashboard/customers");
    await page.getByRole("button", { name: /new customer/i }).click();

    const sheet = new LeadSheet(page);
    await sheet.expectOpen();
    await expect(sheet.root.getByText(/email/i).first()).toBeVisible();
    await expect(sheet.root.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });

  test("Settings cards open each admin settings area", async ({ page, expectHealthy }) => {
    const cards = ["General", "Lead sources", "Lead assignment", "Meal types", "Integrations", "Payment"];
    for (const label of cards) {
      await page.goto("/dashboard/settings");
      await expectHealthy(page, "Settings");
      await page.getByRole("link", { name: new RegExp(label, "i") }).first().click();
      await page.waitForLoadState("domcontentloaded");
      await expect(page.locator("body")).not.toContainText(/something went wrong/i);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    }
  });

  test("Catalog index links into dishes", async ({ page, expectHealthy }) => {
    await page.goto("/dashboard/catalog");
    await expectHealthy(page, "Catalog");
    await page.getByRole("link", { name: /dishes/i }).first().click();
    await expectHealthy(page, /Dish/i);
  });
});
