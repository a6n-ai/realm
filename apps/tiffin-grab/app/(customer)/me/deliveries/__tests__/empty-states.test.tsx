// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/components/providers/timezone-provider", () => ({
  useTimezone: () => "America/Toronto",
}));

vi.mock("@/components/motion", () => ({ Lottie: ({ label }: { label?: string }) => <div data-testid="lottie" aria-label={label} /> }));

import { DeliveryCalendar } from "../delivery-calendar";
import type { Subscription, CustomerDelivery } from "@/lib/services/customer-deliveries.service";
import type { WaitlistedSubscription } from "@/lib/services/customer-deliveries.service";
import type { DeliveryCardData } from "../delivery-calendar";

afterEach(cleanup);

const activeSub: Subscription = {
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
} as Subscription;

const activeDelivery: DeliveryCardData = {
  publicId: "del_1",
  orderPublicId: "ord_1",
  planName: "Weekly Veg",
  deliveryDate: "2026-07-20",
  status: "scheduled",
  isMakeup: false,
  cutoffAt: Date.now() + 1000 * 60 * 60 * 24,
  meal: { pending: true },
  address: { fullName: "A", addressLine: "1 St", city: "City", postalCode: "00000" },
  hasAddressOverride: false,
} as unknown as DeliveryCardData;

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

describe("DeliveryCalendar — three-way empty state", () => {
  it("shows the active subscription list, not the waitlist card, when active subs are present", () => {
    render(
      <DeliveryCalendar
        subscriptions={[activeSub]}
        deliveries={[activeDelivery]}
        extraWindows={0}
        waitlisted={[waitlistedSub]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Weekly Veg" })).toBeInTheDocument();
    expect(screen.queryByText(/on the waitlist/i)).not.toBeInTheDocument();
  });

  it("shows the WaitlistCard when there are zero active subs but a waitlisted one", () => {
    render(
      <DeliveryCalendar
        subscriptions={[]}
        deliveries={[]}
        extraWindows={0}
        waitlisted={[waitlistedSub]}
      />,
    );
    expect(screen.getByText(/on the waitlist/i)).toBeInTheDocument();
    expect(screen.queryByText(/No active subscriptions/i)).not.toBeInTheDocument();
  });

  it("shows the No active subscriptions empty state with a Browse plans CTA when there are zero active and zero waitlisted", () => {
    render(
      <DeliveryCalendar
        subscriptions={[]}
        deliveries={[]}
        extraWindows={0}
        waitlisted={[]}
      />,
    );
    expect(screen.getByText(/No active subscriptions/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Browse plans/i })).toHaveAttribute("href", "/subscribe");
  });
});
