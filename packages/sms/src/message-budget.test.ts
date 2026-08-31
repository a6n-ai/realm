import { describe, expect, it } from "vitest";
import { countSegments } from "./segments";

/**
 * The real copy this app sends. Kept here as a budget guard: SMS is billed per
 * segment, so a template that quietly grows past 2 segments doubles the cost of
 * every send using it — and at campaign scale that is the whole bill.
 *
 * If one of these fails, shorten the copy; do not raise the ceiling.
 */
const TEMPLATES: [string, string][] = [
  [
    "verification code",
    "Your Puchkaman verification code is 123456. It expires in 10 minutes.",
  ],
  [
    "order placed",
    "We got your order ord_AbCdEfGhIjKl. Track it at https://puchkaman.ca/track",
  ],
  ["order paid", "Payment received for order ord_AbCdEfGhIjKl. Thanks!"],
];

describe("message budget", () => {
  it.each(TEMPLATES)("%s stays within 2 segments", (_label, text) => {
    expect(countSegments(text).segments).toBeLessThanOrEqual(2);
  });

  it("stays on GSM-7 — one emoji would drop the budget from 160 to 70 chars", () => {
    for (const [, text] of TEMPLATES) {
      expect(countSegments(text).encoding).toBe("GSM-7");
    }
  });
});
