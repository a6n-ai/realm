import { expect, type Page } from "@playwright/test";

export const FATAL_PAGE =
  /something went wrong|application error|unhandled runtime|internal server error|this page could not be found|failed to compile/i;

export async function expectHealthyPage(page: Page, heading?: string | RegExp) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(300);

  const body = await page.locator("body").innerText();
  expect(body, `fatal copy on ${page.url()}`).not.toMatch(FATAL_PAGE);

  if (heading) {
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1.first(), `missing h1 on ${page.url()}`).toBeVisible({ timeout: 15_000 });
    await expect(h1.first()).toContainText(heading);
  }
}

export async function expectNoHttpFailure(page: Page, path: string) {
  const res = await page.goto(path, { waitUntil: "domcontentloaded" });
  const status = res?.status() ?? 0;
  expect(status, `HTTP ${status} for ${path}`).toBeLessThan(400);
  return res;
}
