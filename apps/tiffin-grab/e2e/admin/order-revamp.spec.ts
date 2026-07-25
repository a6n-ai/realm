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

  test("order detail shows Summary and Payment cards with pricing context", async ({ page }) => {
    test.skip(!createdOrderUrl, "Requires create-order test to run first");
    await page.goto(createdOrderUrl!);

    const detail = new OrderDetailPage(page);
    await detail.expectSummaryAndPaymentCards();
    await expect(detail.summaryCard().getByText(/SUB-/)).toBeVisible();
    await expect(detail.paymentCard().getByText(/\$\d|CAD|₹|order total/i).first()).toBeVisible();
  });

  test("order detail payment panel exposes copy pay link or settled row", async ({ page }) => {
    test.skip(!createdOrderUrl, "Requires create-order test to run first");
    await page.goto(createdOrderUrl!);

    const detail = new OrderDetailPage(page);
    await expect(detail.section("Payment")).toBeVisible();
    const copyLink = detail.copyPayLink();
    if ((await copyLink.count()) > 0) {
      await expect(copyLink.first()).toBeVisible();
    } else {
      await expect(detail.paymentCard().getByText(/\$\d|paid|awaiting|simulated|pending/i).first()).toBeVisible();
    }
  });

  test("order detail activity log has search, facet filters, and pagination", async ({ page }) => {
    test.skip(!createdOrderUrl, "Requires create-order test to run first");
    await page.goto(createdOrderUrl!);

    const detail = new OrderDetailPage(page);
    await detail.expectActivityFilters();
    await expect(detail.activityPaginationRange()).toBeVisible();

    const search = detail.activitySection().getByPlaceholder(/search activity/i);
    await search.fill("created");
    await expect(detail.activitySection().getByText(/order created|created/i).first()).toBeVisible();
    await search.fill("");
  });

  test("order detail activity URL category filter applies", async ({ page }) => {
    test.skip(!createdOrderUrl, "Requires create-order test to run first");
    const url = new URL(createdOrderUrl!);
    url.searchParams.set("category", "lifecycle");
    await page.goto(url.toString());

    const detail = new OrderDetailPage(page);
    await expect(detail.activitySection().getByText(/order created|activated|created/i).first()).toBeVisible();
    await expect(detail.activitySection().getByText(/delivery skipped|meal pick/i)).toHaveCount(0);
  });

  test("orders list uses facet filters like activity log", async ({ page, expectHealthy }) => {
    await page.goto("/dashboard/orders");
    await expectHealthy(page, /orders/i);
    await expect(page.getByRole("button", { name: /filter|add filter/i }).first()).toBeVisible();
    await expect(page.getByPlaceholder(/search/i).first()).toBeVisible();
    await expect(page.getByText(/\d+–\d+ of \d+|per page/i).first()).toBeVisible();
  });

  test("admin deliveries day detail shows skip, reschedule, or menu state", async ({ page }) => {
    test.skip(!createdOrderUrl, "Requires create-order test to run first");
    await page.goto(createdOrderUrl!);

    const calendarDay = page.getByRole("button", { name: /scheduled|today/i }).first();
    if (await calendarDay.count()) {
      await calendarDay.click();
    }

    await expect(
      page.getByText(/skip this day|reschedule|menu for|not scheduled this day/i).first(),
    ).toBeAttached({ timeout: 15_000 });
  });
});
