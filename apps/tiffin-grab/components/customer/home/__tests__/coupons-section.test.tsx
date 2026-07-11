// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TimezoneProvider } from "@/components/providers/timezone-provider";
import type { AvailableCoupon } from "@/lib/services/coupons.service";
import { CouponsSection } from "../coupons-section";

afterEach(cleanup);

function coupon(overrides: Partial<AvailableCoupon>): AvailableCoupon {
  return {
    code: "SAVE20",
    name: "Save on your order",
    description: null,
    kind: "percentage",
    valuePct: "20",
    valueAmount: null,
    minSubtotal: null,
    planTypes: [],
    autoApply: false,
    expiresAt: null,
    ...overrides,
  };
}

describe("CouponsSection", () => {
  it("renders each coupon as a card with the correct discount line", () => {
    const coupons: AvailableCoupon[] = [
      coupon({ code: "SAVE20", kind: "percentage", valuePct: "20", valueAmount: null }),
      coupon({ code: "FLAT5", kind: "fixed", valuePct: null, valueAmount: "5.00" }),
      coupon({ code: "FREEDEL", kind: "free_delivery", valuePct: null, valueAmount: null }),
    ];
    render(
      <TimezoneProvider tz="America/New_York">
        <CouponsSection coupons={coupons} />
      </TimezoneProvider>,
    );

    expect(screen.getByText("SAVE20")).toBeInTheDocument();
    expect(screen.getByText("20% off")).toBeInTheDocument();
    expect(screen.getByText("FLAT5")).toBeInTheDocument();
    expect(screen.getByText("$5 off")).toBeInTheDocument();
    expect(screen.getByText("FREEDEL")).toBeInTheDocument();
    expect(screen.getAllByText("Free delivery").length).toBeGreaterThan(0);
  });

  it("renders an EmptyState when there are no available coupons", () => {
    render(
      <TimezoneProvider tz="America/New_York">
        <CouponsSection coupons={[]} />
      </TimezoneProvider>,
    );
    expect(screen.getByText(/no coupons/i)).toBeInTheDocument();
  });
});
