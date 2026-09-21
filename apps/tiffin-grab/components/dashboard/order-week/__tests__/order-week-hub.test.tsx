// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Trip } from "@/lib/deliveries-view";
import type { OrderWeek } from "@/lib/services/order-week.service";
import { OrderWeekHub } from "../order-week-hub";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/(customer)/me/deliveries/actions", () => ({
  applyMyDeliverySwap: vi.fn(), pauseMySubscription: vi.fn(), removeMyDeliverySwap: vi.fn(), rescheduleMyDelivery: vi.fn(),
  resumeMySubscription: vi.fn(), scheduleMyPooledTiffin: vi.fn(), unskipMyDelivery: vi.fn(),
}));
afterEach(cleanup);

const NOW = Date.parse("2026-09-21T12:00:00Z");
const day = (date: string, dish: string, locksWith: string | null = null) => ({ date, dishSummary: dish, swaps: [], locksWith });
const mon: Trip = {
  orderId: "o", date: "2026-09-21", deliveryId: "d1", units: 2, coversDates: ["2026-09-21", "2026-09-22"], coversLabel: "Covers Mon + Tue",
  eatingDays: [day("2026-09-21", "Dal"), day("2026-09-22", "Kadhi", "2026-09-21")], status: "upcoming", cutoffAt: NOW + 30 * 3600e3,
  mergedInto: null, isMakeup: false, pooled: false, rescheduled: false,
};
const data = {
  plan: {
    orderId: "o", today: "2026-09-21", days: [], categoryLabels: {}, categoryPortions: {}, swapCategories: {},
    sub: { publicId: "o", mealSizeName: "Large", planName: "Veg", status: "active" },
    counts: { total: 20, delivered: 4, remaining: 16, pooled: 0, holdDays: 0, persons: 1, lastDeliveryDate: "2026-10-02", deliveryWeekdays: ["mon"] },
    ctx: { cutoffHour: 18, timezone: "UTC", pooled: 0, lastDeliveryDate: "2026-10-02", deliveryWeekdays: ["mon"], active: true },
    pause: { limits: {}, usage: {} },
  },
  trips: [mon],
  agenda: {
    "2026-09-21": [{ orderId: "o", status: "scheduled", cutoffAt: mon.cutoffAt, deliveryDate: "2026-09-21", truck: true, units: 2, covers: mon.coversDates }],
    "2026-09-22": [{ orderId: "o", status: "scheduled", cutoffAt: mon.cutoffAt, deliveryDate: "2026-09-21", truck: false, units: 2, covers: mon.coversDates }],
    "2026-10-05": [{ orderId: "o", status: "scheduled", cutoffAt: mon.cutoffAt, deliveryDate: "2026-10-05", truck: true, units: 1, covers: ["2026-10-05"] }],
  },
  weekStart: "2026-09-21", firstWeek: "2026-09-21", lastWeek: "2026-10-05", now: NOW,
} as unknown as OrderWeek;

describe("OrderWeekHub (admin, shadcn)", () => {
  it("lists eating days of the week; a Mon trip feeds Mon and Tue; Tue names the delivery", () => {
    render(<OrderWeekHub data={data} />);
    expect(screen.getAllByTestId("trip-row")).toHaveLength(2);
    fireEvent.click(screen.getAllByTestId("trip-row")[1]!);
    expect(screen.getByTestId("delivery-block")).toHaveTextContent("Arrives Mon, Sep 21 with Mon");
    expect(screen.getByTestId("delivery-block")).toHaveTextContent("2 tiffins covering Mon, Tue");
  });
  it("strip marks the delivery day and next-delivery banner shows", () => {
    render(<OrderWeekHub data={data} />);
    expect(within(screen.getByTestId("week-strip")).getByRole("button", { name: /Mon, Sep 21, eating, delivery arrives/ })).toBeInTheDocument();
    expect(screen.getByTestId("next-delivery")).toHaveTextContent("Next delivery: Mon, Sep 21, 2 tiffins (Mon + Tue)");
  });
  it("has Reschedule and Swap but no Hold; Reschedule opens an eating-day picker", () => {
    render(<OrderWeekHub data={data} />);
    expect(screen.queryByRole("button", { name: /^Hold/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reschedule this day" }));
    expect(screen.getByRole("dialog", { name: /Reschedule Mon, Sep 21/ })).toBeInTheDocument();
  });
  it("info button explains the trip", () => {
    render(<OrderWeekHub data={data} />);
    fireEvent.click(screen.getByRole("button", { name: "Details for Tue, Sep 22" }));
    expect(screen.getByRole("dialog", { name: /Tue, Sep 22 · trip details/ })).toBeInTheDocument();
  });
  it("next week arrow updates ?week via router.replace", () => {
    replace.mockClear();
    render(<OrderWeekHub data={data} />);
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(replace.mock.calls[0]![0]).toContain("week=2026-09-28");
  });
});
