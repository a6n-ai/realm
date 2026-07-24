import path from "node:path";
import { mkdirSync } from "node:fs";
import { test as setup, expect } from "@playwright/test";
import { customerCreds, apiSignIn } from "./helpers/auth";

const out = path.join(process.cwd(), "e2e/.auth/customer.json");

setup("authenticate as customer", async ({ page }) => {
  mkdirSync(path.dirname(out), { recursive: true });
  await apiSignIn(page.request, customerCreds());
  await page.goto("/me");
  await expect(page).toHaveURL(/\/me/);
  await page.context().storageState({ path: out });
});
