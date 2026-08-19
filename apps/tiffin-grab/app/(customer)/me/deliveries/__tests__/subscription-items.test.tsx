// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ refresh: vi.fn(), push: vi.fn() })),
}));

import { SubscriptionPlanHeader, SubscriptionPlanSummary } from "../subscription-items";
import type { Subscription } from "@/lib/services/customer-deliveries.service";

afterEach(cleanup);

const sub: Subscription = {
  publicId: "ord_1",
  planName: "Weekly Veg",
  planType: "tiffin",
  planKey: "weekly-veg",
  status: "active",
  fullName: "A",
  addressLine: "1 St",
  city: "City",
  postalCode: "00000",
  zoneId: null,
  mealSizeId: 1n,
  mealSizeName: "Maharaja Thali (Veg)",
  persons: 2,
  categoryCounts: { sabzi: 1, dal: 1, roti: 8 },
};

describe("SubscriptionPlanSummary", () => {
  it("renders item chips and persons, without repeating the meal size", () => {
    render(
      <SubscriptionPlanSummary
        sub={sub}
        categoryLabels={{ sabzi: "Sabzi", dal: "Daal", roti: "Roti" }}
        categoryPortions={{ sabzi: "12oz", dal: "8oz", roti: "1 roti" }}
      />,
    );
    expect(screen.getByText("1× Sabzi · 12oz")).toBeInTheDocument();
    expect(screen.getByText("1× Daal · 8oz")).toBeInTheDocument();
    expect(screen.getByText("8× Roti · 1 roti")).toBeInTheDocument();
    expect(screen.getByText("2 persons")).toBeInTheDocument();
    expect(screen.queryByText(/Maharaja Thali/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bTU\b/)).not.toBeInTheDocument();
  });
});

describe("SubscriptionPlanHeader", () => {
  it("renders meal size as heading when there is a single subscription", () => {
    render(
      <SubscriptionPlanHeader
        sub={sub}
        allSubscriptions={[sub]}
        categoryLabels={{ sabzi: "Sabzi", dal: "Daal", roti: "Roti" }}
        today="2030-01-07"
        onSwitch={() => {}}
      />,
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Maharaja Thali (Veg)" })).toBeInTheDocument();
    expect(screen.getByText("Weekly Veg")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    const name = screen.getByRole("heading", { level: 2, name: "Maharaja Thali (Veg)" });
    expect(name.parentElement).toContainElement(screen.getByText("Weekly Veg"));
    expect(name.parentElement).not.toContainElement(screen.getByText("Active"));
  });

  it("renders a selector when there are multiple subscriptions", () => {
    const other: Subscription = { ...sub, publicId: "ord_2", planName: "Daily Plan" };
    render(
      <SubscriptionPlanHeader
        sub={sub}
        allSubscriptions={[sub, other]}
        categoryLabels={{ sabzi: "Sabzi", dal: "Daal", roti: "Roti" }}
        today="2030-01-07"
        onSwitch={() => {}}
      />,
    );
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });
});
