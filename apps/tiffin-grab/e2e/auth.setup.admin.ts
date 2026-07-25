import path from "node:path";
import { mkdirSync } from "node:fs";
import { test as setup, expect } from "@playwright/test";
import { adminCreds, apiSignIn } from "./helpers/auth";

const out = path.join(process.cwd(), "e2e/.auth/admin.json");

setup("authenticate as admin", async ({ page }) => {
  mkdirSync(path.dirname(out), { recursive: true });
  // page.request shares the browser cookie jar (unlike the isolated request fixture).
  await apiSignIn(page.request, adminCreds());
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 30_000 });
  await page.context().storageState({ path: out });
});
