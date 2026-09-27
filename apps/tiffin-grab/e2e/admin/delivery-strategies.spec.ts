import path from "node:path";
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures";

const shots = path.join(process.cwd(), "e2e/test-results/delivery-strategies");

async function addStrategy(page: Page, o: { name: string; tag: string; connectTo?: string; amount?: string }) {
  await page.getByRole("button", { name: "Add delivery strategy" }).click();
  await page.getByLabel("Name").fill(o.name);
  await page.getByRole("radio", { name: o.tag }).click();
  if (o.connectTo) await page.getByRole("button", { name: o.connectTo, exact: true }).click();
  if (o.amount) {
    await page.getByLabel("Charge type").click();
    await page.getByRole("option", { name: /Fixed amount/ }).click();
    await page.getByLabel("Amount").fill(o.amount);
  }
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("row", { name: new RegExp(`^${o.name}`) })).toBeVisible();
}

// Admin: a place type (tag) and strategies under it, two connected to each other, one free.
// Customer: picks the place first, then one of the set and any free strategy. Cleans up after.
// Run with the setup-customer project too: it reuses the saved customer session.
test("tag and connected strategies in admin; place first for the customer", async ({ page, browser, baseURL }) => {
  const stamp = String(Date.now()).slice(-6);
  const tag = `E2E Apt ${stamp}`;
  const lobby = `E2E Lobby ${stamp}`;
  const door = `E2E Door ${stamp}`;
  const call = `E2E Call ${stamp}`;
  page.on("dialog", (d) => void d.accept());

  await page.goto("/dashboard/delivery/charges");
  await page.getByRole("button", { name: "Add tag" }).click();
  await page.getByLabel("Name").fill(tag);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const tagRow = page.getByRole("row", { name: new RegExp(`^${tag}`) });
  await expect(tagRow).toBeVisible();

  await addStrategy(page, { name: lobby, tag });
  await addStrategy(page, { name: door, tag, connectTo: lobby, amount: "1.50" });
  await addStrategy(page, { name: call, tag, amount: "0.50" });

  // Each row shows its tag and what it is connected to, both ways.
  await expect(page.getByRole("row", { name: new RegExp(`^${door}`) })).toContainText(lobby);
  await expect(page.getByRole("row", { name: new RegExp(`^${lobby}`) })).toContainText(door);
  await expect(page.getByRole("row", { name: new RegExp(`^${call}`) })).toContainText(tag);
  await expect(tagRow.getByRole("cell").nth(2)).toHaveText("3");
  await page.screenshot({ path: `${shots}/admin.png`, fullPage: true });

  // Editing a strategy shows its tag and connections as pills, ready to change.
  await page.getByRole("row", { name: new RegExp(`^${door}`) }).getByRole("button", { name: `Edit ${door}` }).click();
  await expect(page.getByRole("radio", { name: tag })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("button", { name: lobby, exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: call, exact: true })).toHaveAttribute("aria-pressed", "false");
  await page.screenshot({ path: `${shots}/admin-edit.png` });
  await page.keyboard.press("Escape");

  const customer = await browser.newContext({ baseURL, storageState: path.join(process.cwd(), "e2e/.auth/customer.json"), viewport: { width: 390, height: 844 } });
  const cp = await customer.newPage();
  await cp.goto("/me/account?section=address");
  await cp.getByRole("button", { name: /Add address/ }).click();
  await cp.getByRole("radio", { name: tag }).click();
  // One of the set: Door replaces Lobby.
  await cp.getByRole("radio", { name: lobby }).click();
  await cp.getByRole("radio", { name: new RegExp(`${door} · \\+\\$1\\.50`) }).click();
  await expect(cp.getByRole("radio", { name: new RegExp(`${door} · `) })).toHaveAttribute("aria-checked", "true");
  await expect(cp.getByRole("radio", { name: lobby })).toHaveAttribute("aria-checked", "false");
  // A free strategy adds on top.
  const callCard = cp.getByRole("button", { name: new RegExp(`${call} · \\+\\$0\\.50`) });
  await callCard.click();
  await expect(callCard).toHaveAttribute("aria-pressed", "true");
  await callCard.scrollIntoViewIfNeeded();
  await cp.screenshot({ path: `${shots}/customer-address.png` });
  await customer.close();

  // Clean up: strategies (their set goes with them), then the tag.
  for (const name of [lobby, door, call]) {
    await page.getByRole("row", { name: new RegExp(`^${name}`) }).getByRole("button", { name: `Delete ${name}` }).click();
    await expect(page.getByRole("row", { name: new RegExp(`^${name}`) })).toHaveCount(0);
  }
  await tagRow.getByRole("button", { name: `Delete ${tag}` }).click();
  await expect(tagRow).toHaveCount(0);
});
