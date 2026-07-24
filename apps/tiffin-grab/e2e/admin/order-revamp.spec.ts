import { test, expect } from "../fixtures";
import { LeadSheet } from "../pages/admin.shell";
import { OrderDetailPage } from "../pages/order-detail.page";
import { slowServerActions } from "../helpers/slow-actions";

test.describe.configure({ mode: "serial" });

test.describe("admin order revamp (desktop)", () => {
  let createdOrderUrl: string | null = null;

  test("new order step 2 shows payment method selection", async ({ page }) => {
    await page.goto("/dashboard/orders");
    await page.getByRole("button", { name: /new order/i }).click();

    const sheet = new LeadSheet(page);
    await sheet.expectOpen();

    const phone = `416555${String(Date.now()).slice(-4)}`;
    await sheet.fillContact({
      name: "E2E Order UI",
      email: `e2e-order-ui-${Date.now()}@example.com`,
      phone,
    });
    await sheet.continue().click();

    await expect(sheet.root.getByText(/^payment$/i)).toBeVisible();
    await expect(
      sheet.root.getByText(/simulated|e-transfer|interac|cash|choose how the customer/i).first(),
    ).toBeVisible();
  });

  test("new inquiry shows loading state while saving", async ({ page }) => {
    await slowServerActions(page, 1200);

    await page.goto("/dashboard/inquiries");
    await page.getByRole("button", { name: /new inquiry/i }).click();

    const sheet = new LeadSheet(page);
    await sheet.expectOpen();

    const phone = `416555${String(Date.now()).slice(-4)}`;
    await sheet.fillContact({
      name: "E2E Inquiry Loader",
      email: `e2e-inquiry-loader-${Date.now()}@example.com`,
      phone,
    });
    await sheet.continue().click();

    const addBtn = sheet.addInquiry();
    await addBtn.click();

    await expect(page.getByText(/adding inquiry/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("dialog", { name: /new inquiry/i })).toBeHidden({ timeout: 45_000 });
  });

  test("create order shows admin success dialog with pay link", async ({ page }) => {
    test.setTimeout(120_000);
    await slowServerActions(page, 600);

    await page.goto("/dashboard/orders");
    await page.getByRole("button", { name: /new order/i }).click();

    const sheet = new LeadSheet(page);
    await sheet.expectOpen();

    const stamp = Date.now();
    const phone = `416555${String(stamp).slice(-4)}`;
    await sheet.fillContact({
      name: "E2E Order Success",
      email: `e2e-order-success-${stamp}@example.com`,
      phone,
    });
    await sheet.continue().click();
    await expect(sheet.root.getByRole("radio", { name: /^veg$/i }).first()).toBeVisible({
      timeout: 15_000,
    });
    await sheet.fillMinimalOrder();
    await expect(sheet.submitOrder()).toBeEnabled({ timeout: 10_000 });
    await sheet.submitOrder().click();

    await expect(page.getByText(/creating order/i)).toBeVisible({ timeout: 5_000 });

    const success = page.getByRole("dialog", { name: /order created/i });
    await expect(success).toBeVisible({ timeout: 90_000 });
    await expect(success.getByText(/SUB-/)).toBeVisible();
    await expect(success.getByRole("button", { name: /copy link/i })).toBeVisible();
    await expect(success.getByRole("button", { name: /view order/i })).toBeVisible();

    await success.getByRole("button", { name: /view order/i }).click();
    await page.waitForURL(/\/dashboard\/orders\//);
    createdOrderUrl = page.url();
    await new OrderDetailPage(page).expectRevampLayout();
  });

  test("order detail uses customer-parity deliveries UI", async ({ page, expectHealthy }) => {
    test.skip(!createdOrderUrl, "Requires create-order test to run first");
    await page.goto(createdOrderUrl!);
    await expectHealthy(page, /.+/);

    const detail = new OrderDetailPage(page);
    await detail.expectRevampLayout();
    await detail.expectDeliveriesCalendar();
  });

  test("order detail payments can expose copy pay link", async ({ page }) => {
    test.skip(!createdOrderUrl, "Requires create-order test to run first");
    await page.goto(createdOrderUrl!);

    await expect(new OrderDetailPage(page).section("Payments")).toBeVisible();
    const copyLink = page.getByRole("button", { name: /copy pay link/i });
    if ((await copyLink.count()) > 0) {
      await expect(copyLink.first()).toBeVisible();
    } else {
      // Simulated/settled payments hide the link — panel should still list the row.
      await expect(page.getByText(/\$\d|paid|awaiting|simulated/i).first()).toBeVisible();
    }
  });
});
