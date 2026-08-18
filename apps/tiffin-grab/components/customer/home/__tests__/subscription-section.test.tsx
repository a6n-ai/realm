// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SubscriptionSection, type SubscriptionWithNext } from "../subscription-section";

afterEach(cleanup);

const baseSub: SubscriptionWithNext = {
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
  mealSizeName: "Regular",
  persons: 1,
  categoryCounts: { sabzi: 1, dal: 1 },
  daysUntilRenewal: 5,
  nextDelivery: {
    publicId: "dlv_1",
    orderId: 1n as unknown as bigint,
    orderPublicId: "ord_1",
    planName: "Weekly Veg",
    deliveryDate: "2026-07-16",
    status: "scheduled",
    cutoffAt: Date.now() + 100000,
    makeupForDeliveryId: null,
    addressLine: null,
    fullName: null,
    city: null,
    postalCode: null,
    isMakeup: false,
  } as never,
};

describe("SubscriptionSection", () => {
  it("renders meal size heading, diet tag, item chips, Manage link — no price", () => {
    render(
      <SubscriptionSection
        subscriptions={[baseSub]}
        categoryLabels={{ sabzi: "Sabzi", dal: "Daal" }}
      />,
    );
    expect(screen.getByText("Regular")).toBeInTheDocument();
    expect(screen.getByText("Weekly Veg")).toBeInTheDocument();
    expect(screen.getByText("1× Sabzi")).toBeInTheDocument();
    expect(screen.getByText("1× Daal")).toBeInTheDocument();
    expect(screen.getByText(/Active/i)).toBeInTheDocument();
    expect(screen.getByText("5 days to renew")).toBeInTheDocument();
    expect(screen.getByText(/Jul 16, 2026/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Manage/i })).toHaveAttribute("href", "/me/deliveries");
    expect(screen.getByRole("link", { name: /Vacation/i })).toHaveAttribute("href", "/me/deliveries");
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("places diet beside the meal size and renew/active on the right", () => {
    render(
      <SubscriptionSection
        subscriptions={[{ ...baseSub, daysUntilRenewal: 14 }]}
        categoryLabels={{ sabzi: "Sabzi", dal: "Daal" }}
        categoryPortions={{ sabzi: "12oz", dal: "8oz" }}
      />,
    );
    const name = screen.getByText("Regular");
    expect(name.parentElement).toContainElement(screen.getByText("Weekly Veg"));
    expect(name.parentElement).not.toContainElement(screen.getByText("Active"));
    expect(screen.getByText("14 days to renew")).toBeInTheDocument();
    expect(screen.getByText("1× Sabzi · 12oz")).toBeInTheDocument();
    expect(screen.getByText("1× Daal · 8oz")).toBeInTheDocument();
    expect(screen.queryByText(/\bTU\b/)).not.toBeInTheDocument();
  });

  it("renders EmptyState with Browse CTA when there are zero active subscriptions", () => {
    render(<SubscriptionSection subscriptions={[]} />);
    expect(screen.getByRole("link", { name: /Browse plans/i })).toHaveAttribute("href", "/subscribe");
  });

  it("sends vacation and manage to the deliveries calendar", () => {
    render(<SubscriptionSection subscriptions={[baseSub]} />);
    expect(screen.getByRole("link", { name: /Manage/i })).toHaveAttribute("href", "/me/deliveries");
    expect(screen.getByRole("link", { name: /Vacation/i })).toHaveAttribute("href", "/me/deliveries");
    expect(screen.getByRole("link", { name: /Renew plan/i })).toHaveAttribute("href", "/me/renew");
  });
});
