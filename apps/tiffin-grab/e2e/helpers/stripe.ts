import type { Page } from "@playwright/test";

export async function fillCard(page: Page, number: string) {
  const frame = page.frameLocator('iframe[title="Secure payment input frame"]').first();
  await frame.getByLabel("Card number").fill(number);
  await frame.getByLabel("Expiration").fill("12 / 34");
  await frame.getByLabel("Security code").fill("123");
  await frame.getByLabel(/ZIP|Postal/).fill("M5H 2N2");
}
