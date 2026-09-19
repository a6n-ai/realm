// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { OrderSummary } from "../order-summary";
import type { PricingResult } from "@/lib/pricing";
import type { WizardSelections } from "@/components/wizard/selections";

const sel = {
  mealSizeId: "m", frequencyKey: "f", eatingDays: ["mon", "wed", "fri"], persons: 1, mealSlots: [],
  includeSaturday: false, includeSunday: false, durationWeeks: 4, startDate: "2026-09-21", planKey: null,
} as WizardSelections;

const result = {
  lineItems: [{ label: "Tiffins (12 × $10.00)", amount: 120 }],
  adjustments: [{ label: "4-week discount", amount: 10 }],
  taxLines: [{ name: "HST", ratePct: 13, amount: 14.3 }],
  taxTotal: 14.3, tiffinCount: 12, perTiffinPrice: 10,
  tier: { upliftPct: 0 }, subtotal: 120, total: 124.3,
} as unknown as PricingResult;

describe("OrderSummary", () => {
  afterEach(cleanup);
  it("shows quantity, day pills and start date", () => {
    render(<OrderSummary selections={sel} result={result} editHref="/subscribe" />);
    expect(screen.getByText("3 tiffins a week × 4 weeks = 12 tiffins")).toBeTruthy();
    expect(screen.getByText("Wed")).toBeTruthy();
    expect(screen.getByText(/Starts Mon, Sep 21/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Edit" }).getAttribute("href")).toBe("/subscribe");
  });
  it("displays server amounts verbatim and the savings note", () => {
    render(<OrderSummary selections={sel} result={result} editHref="/subscribe" />);
    expect(screen.getByText("$124.30")).toBeTruthy();
    expect(screen.getByText("−$10.00")).toBeTruthy();
    expect(screen.getByText("You save $10.00")).toBeTruthy();
  });
});
