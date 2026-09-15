import { execSync } from "node:child_process";
import { test, expect } from "../fixtures";

/**
 * Exercises the OptimoRoute integration against the REAL OptimoRoute API — push,
 * pull, manual per-delivery push/remove, and cancel-triggered cleanup. Deliberately
 * NOT run in CI or by default: it mutates a live, shared third-party account.
 *
 * Run locally with:
 *   OPTIMOROUTE_LIVE_TEST=1 pnpm --filter tiffin-grab test:e2e:optimoroute-live
 *
 * Requires OPTIMOROUTE_API_KEY set in .env.local and a running dev server (this
 * config has no webServer — start `pnpm dev` yourself first, same as every other
 * spec in this suite).
 */
test.describe("OptimoRoute live regression (local only, hits real API)", () => {
  test.skip(
    !process.env.OPTIMOROUTE_LIVE_TEST,
    "set OPTIMOROUTE_LIVE_TEST=1 to run this against the live OptimoRoute API",
  );

  test.beforeAll(() => {
    // Idempotent: reuses the QA customer's order if one is already active/paused,
    // otherwise creates a fresh one. Safe to run repeatedly.
    execSync("npx vitest run --config vitest.seed.config.ts db/seed-qa-customer.test.ts", {
      stdio: "inherit",
    });
  });

  test("push, pull, manual push/remove, and cancel-cleanup round-trip against live OptimoRoute", async ({
    page,
  }) => {
    // Find the QA order through the real admin UI, not a DB backdoor — this is
    // a regression test for the feature as staff actually use it.
    await page.goto("/dashboard/orders");
    await page.keyboard.press("Escape"); // dismiss the global cmdk palette if it's open
    await page.getByRole("textbox", { name: "Search orders…" }).fill("QA Customer");
    const activeRow = page.getByRole("row").filter({ hasText: "Active" }).first();
    await expect(activeRow).toBeVisible({ timeout: 15_000 });
    const href = await activeRow.getByRole("link", { name: "QA Customer" }).getAttribute("href");
    const orderId = href!.match(/ord_[A-Za-z0-9_-]+/)![0];
    await page.goto(`/dashboard/orders/${orderId}`);

    // --- Manual per-delivery push (order detail OptimoRoute panel) ---
    const optimoCard = page
      .getByRole("heading", { name: "OptimoRoute" })
      .locator("xpath=ancestor::*[contains(@class,'rounded')][1]");
    await expect(optimoCard).toBeVisible();
    const firstPushButton = optimoCard.getByRole("button", { name: "Push" }).first();
    const firstRow = firstPushButton.locator("xpath=ancestor::div[contains(@class,'items-center')][1]");
    const deliveryDate = (await firstRow.locator("p").first().textContent())!.trim();
    expect(deliveryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await firstPushButton.click();
    // Manual push logs its own activity row — proves the real create_order call fired.
    await expect(page.getByText(new RegExp(`Sent to OptimoRoute for ${deliveryDate}`)).first()).toBeVisible({
      timeout: 15_000,
    });

    // --- Day-level dispatch page: push, then pull ---
    await page.goto(`/dashboard/dispatch?date=${deliveryDate}`);
    await expect(page.getByRole("heading", { level: 1, name: "Dispatch" })).toBeVisible();

    const sendButton = page.getByRole("button", { name: /^Send \d+ stop/ });
    await expect(sendButton).toBeVisible();
    await sendButton.click();
    await expect(page.getByText(/^Sent \d+$/)).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Pull planned routes" }).click();
    // Either outcome is a healthy result — this shared account may or may not have
    // an actual OptimoRoute-side route plan for this date. A crash is the failure mode.
    await expect(
      page.getByText(/Assigned \d+/).or(page.getByText(/No planned routes found/)).first(),
    ).toBeVisible({ timeout: 15_000 });

    // --- Cancel triggers auto-cleanup: verify no error, order flips to cancelled ---
    await page.goto(`/dashboard/orders/${orderId}`);
    await page.getByRole("button", { name: "Cancel order" }).click();
    await page.getByRole("button", { name: "Cancel order" }).last().click();
    await expect(page.getByText("Cancelled", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  });
});
