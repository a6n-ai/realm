// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/app/(customer)/me/deliveries/actions", () => ({
  pauseMySubscription: vi.fn().mockResolvedValue(undefined),
  resumeMySubscription: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/components/motion", () => ({ Lottie: ({ label }: { label?: string }) => <div data-testid="lottie" aria-label={label} /> }));

import { SubscriptionSection, type SubscriptionWithNext } from "../subscription-section";
import type { WaitlistedSubscription } from "@/lib/services/customer-deliveries.service";

afterEach(cleanup);

const activeSub: SubscriptionWithNext = {
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
  nextDelivery: null,
};

const waitlistedSub: WaitlistedSubscription = {
  publicId: "ord_2",
  planName: "Veg Tiffin",
  mealSizeName: "Medium",
  daysPerWeek: 5,
  status: "waitlisted",
  fullName: "A",
  addressLine: "1 St",
  city: "Toronto",
  postalCode: "M4B 1B3",
};

describe("SubscriptionSection — waitlist three-way", () => {
  it("shows active subscription content, not the waitlist card, when active subs are present", () => {
    render(<SubscriptionSection subscriptions={[activeSub]} waitlisted={[waitlistedSub]} />);
    expect(screen.getByText("Weekly Veg")).toBeInTheDocument();
    expect(screen.queryByText(/on the waitlist/i)).not.toBeInTheDocument();
  });

  it("shows the WaitlistCard when there are zero active subs but a waitlisted one", () => {
    render(<SubscriptionSection subscriptions={[]} waitlisted={[waitlistedSub]} />);
    expect(screen.getByText(/on the waitlist/i)).toBeInTheDocument();
    expect(screen.queryByText(/No active subscriptions/i)).not.toBeInTheDocument();
  });

  it("shows the No active subscriptions empty state when there are zero active and zero waitlisted", () => {
    render(<SubscriptionSection subscriptions={[]} waitlisted={[]} />);
    expect(screen.getByText(/No active subscriptions/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Browse plans/i })).toHaveAttribute("href", "/subscribe");
  });
});
