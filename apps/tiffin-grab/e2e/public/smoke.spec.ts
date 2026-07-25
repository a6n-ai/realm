import { test, expect } from "../fixtures";
import { PUBLIC_ROUTES } from "./routes";
import { FATAL_PAGE } from "../helpers/assert";

test.describe("public feature smoke", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`loads ${route.id} (${route.path})`, async ({ page }) => {
      const res = await page.goto(route.path, { waitUntil: "domcontentloaded" });
      expect(res?.status() ?? 0, `HTTP for ${route.path}`).toBeLessThan(500);

      const body = await page.locator("body").innerText();
      expect(body).not.toMatch(FATAL_PAGE);

      if (route.heading) {
        // Some marketing pages use brand-first layouts without a strict h1 match —
        // fall back to body text when h1 is decorative.
        const h1 = page.getByRole("heading", { level: 1 });
        if (await h1.count()) {
          await expect(h1.first()).toBeVisible();
        } else {
          await expect(page.locator("body")).toContainText(route.heading);
        }
      }
    });
  }

  test("login form can switch to password mode", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /sign in with a password instead/i }).click();
    await expect(page.locator('input[autocomplete="email"]')).toBeVisible();
    await expect(page.locator('input[autocomplete="current-password"]')).toBeVisible();
  });
});
