import path from "node:path";
import { test, expect } from "../fixtures";

const shots = path.join(process.cwd(), "e2e/test-results/delivery-strategies");

// Admin makes a tag and a strategy under it; the customer then sees the tag first under
// their address and that tag's strategies once it is open. Cleans up after itself.
test("tag → strategy in admin, tags first for the customer", async ({ page, browser, baseURL }) => {
  const stamp = String(Date.now()).slice(-6);
  const tag = `E2E Spot ${stamp}`;
  const strategy = `E2E Lobby ${stamp}`;
  page.on("dialog", (d) => void d.accept());

  await page.goto("/dashboard/delivery/charges");
  await expect(page.getByText("Tags", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Add tag" }).click();
  await page.getByLabel("Name").fill(tag);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const tagRow = page.getByRole("row", { name: new RegExp(tag) });
  await expect(tagRow).toBeVisible();

  await page.getByRole("button", { name: "Add delivery strategy" }).click();
  await page.getByLabel("Name").fill(strategy);
  await page.getByLabel("Tag").click();
  await page.getByRole("option", { name: tag }).click();
  await page.getByLabel("Charge type").click();
  await page.getByRole("option", { name: /Fixed amount/ }).click();
  await page.getByLabel("Amount").fill("1.50");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  // The strategies table shows the assigned tag; the tag counts its strategy.
  const strategyRow = page.getByRole("row", { name: new RegExp(strategy) });
  await expect(strategyRow).toContainText(tag);
  await expect(strategyRow).toContainText("$1.50");
  await expect(tagRow.getByRole("cell").nth(3)).toHaveText("1");
  await page.screenshot({ path: `${shots}/admin.png`, fullPage: true });

  // Editing a strategy shows its tag, ready to change.
  await strategyRow.getByRole("button", { name: `Edit ${strategy}` }).click();
  await expect(page.getByLabel("Tag")).toContainText(tag);
  await page.keyboard.press("Escape");

  // Customer: Account → Addresses → Add address shows the tag chip, then its strategies.
  // The customer session saved by the setup-customer project (run it alongside admin).
  const customer = await browser.newContext({ baseURL, storageState: path.join(process.cwd(), "e2e/.auth/customer.json"), viewport: { width: 390, height: 844 } });
  const cp = await customer.newPage();
  await cp.goto("/me/account?section=address");
  await cp.getByRole("button", { name: /Add address/ }).click();
  const chip = cp.getByRole("tab", { name: new RegExp(tag) });
  await expect(chip).toBeVisible();
  await chip.click();
  const pick = cp.getByRole("radio", { name: new RegExp(`${strategy} · \\+\\$1\\.50`) });
  await pick.scrollIntoViewIfNeeded();
  await expect(pick).toBeVisible();
  await cp.screenshot({ path: `${shots}/customer-address.png` });
  await customer.close();

  // Clean up: the strategy, then its now-empty tag.
  await strategyRow.getByRole("button", { name: `Delete ${strategy}` }).click();
  await expect(strategyRow).toHaveCount(0);
  await tagRow.getByRole("button", { name: `Delete ${tag}` }).click();
  await expect(tagRow).toHaveCount(0);
});
