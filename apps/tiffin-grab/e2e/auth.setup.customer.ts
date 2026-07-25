import path from "node:path";
import { mkdirSync } from "node:fs";
import { test as setup, expect } from "@playwright/test";
import { customerCreds, apiSignIn } from "./helpers/auth";

const out = path.join(process.cwd(), "e2e/.auth/customer.json");

setup("authenticate as customer", async ({ page }) => {
  setup.setTimeout(120_000);
  mkdirSync(path.dirname(out), { recursive: true });
  await apiSignIn(page.request, customerCreds());
  await page.goto("/me", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/\/me/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
  await page.context().storageState({ path: out });
});
