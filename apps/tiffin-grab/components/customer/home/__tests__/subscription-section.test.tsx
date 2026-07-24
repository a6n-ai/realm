// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const pauseMySubscription = vi.fn().mockResolvedValue(undefined);
const resumeMySubscription = vi.fn().mockResolvedValue(undefined);
vi.mock("@/app/(customer)/me/deliveries/actions", () => ({
  pauseMySubscription: (...args: unknown[]) => pauseMySubscription(...args),
  resumeMySubscription: (...args: unknown[]) => resumeMySubscription(...args),
}));

import { SubscriptionSection, type SubscriptionWithNext } from "../subscription-section";

afterEach(() => {
  cleanup();
  pauseMySubscription.mockClear();
  resumeMySubscription.mockClear();
});

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
  mealSizeName: "Regular",
  persons: 1,
  categoryCounts: { sabzi: 1, dal: 1 },
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
  it("renders plan, status pill, next-delivery date, Manage link — no meal chips, no price", () => {
    render(<SubscriptionSection subscriptions={[baseSub]} />);
    expect(screen.getByText("Weekly Veg")).toBeInTheDocument();
    expect(screen.getByText(/Active/i)).toBeInTheDocument();
    expect(screen.getByText(/Jul 16, 2026/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Manage/i })).toHaveAttribute("href", "/me/deliveries");
    expect(screen.queryByText(/×/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("renders EmptyState with Browse CTA when there are zero active subscriptions", () => {
    render(<SubscriptionSection subscriptions={[]} />);
    expect(screen.getByRole("link", { name: /Browse plans/i })).toHaveAttribute("href", "/subscribe");
  });

  it("wires Pause to pauseMySubscription(order.publicId, window)", () => {
    render(<SubscriptionSection subscriptions={[baseSub]} />);
    fireEvent.change(screen.getByLabelText(/from/i), { target: { value: "2026-07-20" } });
    fireEvent.change(screen.getByLabelText(/until/i), { target: { value: "2026-07-27" } });
    fireEvent.click(screen.getByRole("button", { name: /Pause/i }));
    expect(pauseMySubscription).toHaveBeenCalledWith("ord_1", { from: "2026-07-20", until: "2026-07-27" });
  });

  it("wires Resume to resumeMySubscription(order.publicId) for a paused subscription", () => {
    render(<SubscriptionSection subscriptions={[{ ...baseSub, status: "paused" }]} />);
    screen.getByRole("button", { name: /Resume/i }).click();
    expect(resumeMySubscription).toHaveBeenCalledWith("ord_1");
  });
});
