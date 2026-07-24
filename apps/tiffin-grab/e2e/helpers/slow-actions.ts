import type { Page } from "@playwright/test";

/** Delay Next.js server actions so loading overlays stay visible in E2E. */
export async function slowServerActions(page: Page, delayMs = 1200) {
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (req.method() === "POST" && req.headers()["next-action"]) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
    await route.continue();
  });
}
