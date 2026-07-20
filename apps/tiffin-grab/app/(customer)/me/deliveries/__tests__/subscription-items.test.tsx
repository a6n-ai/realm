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
  mealSizeName: "Maharaja Thali (Veg)",
  persons: 2,
  categoryCounts: { sabzi: 1, dal: 1, roti: 8 },
};

describe("SubscriptionPlanSummary", () => {
  it("renders flat plan text with meal size, items, and persons", () => {
    render(<SubscriptionPlanSummary sub={sub} categoryLabels={{ sabzi: "Sabzi", dal: "Daal", roti: "Roti" }} />);
    const text = screen.getByText(/Maharaja Thali \(Veg\)/);
    expect(text).toBeInTheDocument();
    expect(text.textContent).toMatch(/1× Sabzi/);
    expect(text.textContent).toMatch(/8× Roti/);
    expect(text.textContent).toMatch(/2 persons/);
  });
});

describe("SubscriptionPlanHeader", () => {
  it("renders plan name as heading when there is a single subscription", () => {
    render(
      <SubscriptionPlanHeader
        sub={sub}
        allSubscriptions={[sub]}
        categoryLabels={{ sabzi: "Sabzi", dal: "Daal", roti: "Roti" }}
        onSwitch={() => {}}
      />,
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Weekly Veg" })).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("renders a selector when there are multiple subscriptions", () => {
    const other: Subscription = { ...sub, publicId: "ord_2", planName: "Daily Plan" };
    render(
      <SubscriptionPlanHeader
        sub={sub}
        allSubscriptions={[sub, other]}
        categoryLabels={{ sabzi: "Sabzi", dal: "Daal", roti: "Roti" }}
        onSwitch={() => {}}
      />,
    );
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });
});
