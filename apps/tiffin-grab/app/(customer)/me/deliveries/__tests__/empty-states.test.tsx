// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ refresh: vi.fn(), push: vi.fn() })),
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
  mealSizeName: "Regular",
  persons: 1,
  categoryCounts: { sabzi: 1, dal: 1 },
};

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
  it("shows plan name as flat text without a selector when there is one active sub", () => {
    render(
      <DeliveryCalendar
        subscriptions={[activeSub]}
        deliveries={[activeDelivery]}
        monthKey="2026-07"
        waitlisted={[waitlistedSub]}
        categoryLabels={{ sabzi: "Sabzi", dal: "Daal" }}
      />,
    );
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Weekly Veg" })).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText(/Regular/)).toBeInTheDocument();
    expect(screen.queryByText(/on the waitlist/i)).not.toBeInTheDocument();
  });

  it("shows subscription selector when there are multiple active subs", () => {
    const secondSub: Subscription = {
      ...activeSub,
      publicId: "ord_2",
      planName: "Daily Non-Veg",
    };
    render(
      <DeliveryCalendar
        subscriptions={[activeSub, secondSub]}
        selectedPublicId="ord_1"
        deliveries={[activeDelivery]}
        monthKey="2026-07"
        waitlisted={[]}
      />,
    );
    expect(screen.getByRole("combobox")).toHaveTextContent("Weekly Veg");
  });

  it("shows the WaitlistCard when there are zero active subs but a waitlisted one", () => {
    render(
      <DeliveryCalendar
        subscriptions={[]}
        deliveries={[]}
        monthKey="2026-07"
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
        monthKey="2026-07"
        waitlisted={[]}
      />,
    );
    expect(screen.getByText(/No active subscriptions/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Browse plans/i })).toHaveAttribute("href", "/subscribe");
  });

  it("month navigation requests the next week via ?week=", async () => {
    const push = vi.fn();
    const { useRouter } = await import("next/navigation");
    vi.mocked(useRouter).mockReturnValue({ refresh: vi.fn(), push } as unknown as ReturnType<typeof useRouter>);

    render(
      <DeliveryCalendar
        subscriptions={[activeSub]}
        deliveries={[activeDelivery]}
        monthKey="2026-07"
        today="2026-07-20"
        waitlisted={[]}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /Go to the Next Month/i })[0]!);
    expect(push).toHaveBeenCalledWith("/me/deliveries?month=2026-08&sub=ord_1");
  });
});
