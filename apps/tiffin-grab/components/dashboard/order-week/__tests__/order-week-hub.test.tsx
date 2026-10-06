// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Trip } from "@/lib/deliveries-view";
import type { OrderWeek } from "@/lib/services/order-week.service";
import { OrderWeekHub } from "../order-week-hub";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace }),
  useSearchParams: () => new URLSearchParams("tab=deliveries"),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/(customer)/me/deliveries/actions", () => ({
  applyMyDeliverySwap: vi.fn(), pauseMySubscription: vi.fn(), removeMyDeliverySwap: vi.fn(), rescheduleMyDelivery: vi.fn(),
  resumeMySubscription: vi.fn(), scheduleMyPooledTiffin: vi.fn(), unskipMyDelivery: vi.fn(),
  setMyDeliveryAddress: vi.fn(), clearMyDeliveryAddress: vi.fn(),
}));
vi.mock("@/app/(dashboard)/dashboard/orders/[id]/actions", () => ({
  setDeliveryStatusAction: vi.fn(async () => ({ ok: true, message: "Delivery status updated" })),
}));
afterEach(cleanup);

const NOW = Date.parse("2026-09-21T12:00:00Z");
const day = (date: string, dish: string, locksWith: string | null = null) => ({ date, dishSummary: dish, swaps: [], locksWith });
const mon: Trip = {
  orderId: "o", date: "2026-09-21", deliveryId: "d1", units: 2, coversDates: ["2026-09-21", "2026-09-22"], coversLabel: "Covers Mon + Tue",
  eatingDays: [day("2026-09-21", "Dal"), day("2026-09-22", "Kadhi", "2026-09-21")], status: "upcoming", cutoffAt: NOW + 30 * 3600e3,
  mergedInto: null, isMakeup: false, rescheduled: false,
};
const data = {
  plan: {
    orderId: "o", today: "2026-09-21", days: [], categoryLabels: {}, categoryPortions: {}, categoryPortionSlots: {}, swapCategories: {},
    sub: { publicId: "o", mealSizeName: "Large", planName: "Veg", status: "active", displayStatus: "active" },
    counts: { total: 20, delivered: 4, remaining: 16, holdDays: 0, persons: 1, lastDeliveryDate: "2026-10-02", deliveryWeekdays: ["mon"] },
    ctx: { cutoffHour: 18, timezone: "UTC", lastDeliveryDate: "2026-10-02", deliveryWeekdays: ["mon"], active: true },
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

import { PagedTable } from "../paged-table";
import { TableCell } from "@foundry/ui/table";

describe("PagedTable (shadcn)", () => {
  const rows = Array.from({ length: 23 }, (_, i) => ({ id: String(i + 1) }));
  const table = () => render(<PagedTable columns={[{ key: "id", label: "ID" }]} rows={rows} rowKey={(r) => r.id} renderRow={(r) => <TableCell>{r.id}</TableCell>} empty="none" />);
  it("paginates: 10 per page, next/prev, page size", () => {
    table();
    expect(screen.getAllByTestId("paged-row")).toHaveLength(10);
    expect(screen.getByText(/1–10 of 23/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText(/11–20 of 23/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "3" }));
    expect(screen.getAllByTestId("paged-row")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Prev" }));
    expect(screen.getByText(/11–20 of 23/)).toBeInTheDocument();
  });
  it("shows the empty message", () => {
    render(<PagedTable columns={[{ key: "id", label: "ID" }]} rows={[]} rowKey={() => "x"} renderRow={() => null} empty="No eating days scheduled." />);
    expect(screen.getByText("No eating days scheduled.")).toBeInTheDocument();
  });
});

describe("OrderWeekHub (admin, shadcn)", () => {
  it("menu not released: notice shows, but days stay listed and movable (customer parity)", () => {
    const out = { ...data, plan: { ...data.plan, days: [{ date: "2026-09-21", menuWeekId: null, meal: null }] } } as unknown as OrderWeek;
    render(<OrderWeekHub data={out} />);
    expect(screen.getByTestId("menu-not-released")).toHaveTextContent("Menu not released yet.");
    expect(screen.queryAllByTestId("trip-row").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Move to another day" })).toBeTruthy();
    expect(screen.getByTestId("week-timeline")).toBeInTheDocument();
  });
  it("the eating-days table lists only the selected week; Next moves the week", () => {
    replace.mockClear();
    render(<OrderWeekHub data={data} />);
    expect(screen.getAllByTestId("paged-row").length).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(replace.mock.calls[0]![0]).toContain("week=2026-09-28");
  });
  it("lists eating days of the week; a Mon trip feeds Mon and Tue; Tue names the delivery", () => {
    render(<OrderWeekHub data={data} />);
    expect(screen.getAllByTestId("trip-row")).toHaveLength(2);
    fireEvent.click(screen.getAllByTestId("trip-row")[1]!);
    expect(screen.getByTestId("delivery-block")).toHaveTextContent("Arrives Mon, Sep 21 with Mon");
    expect(screen.getByText(/2 tiffins on this delivery: 1 Mon \+ 1 Tue/)).toBeInTheDocument();
  });
  it("strip marks the delivery day and next-delivery banner shows", () => {
    render(<OrderWeekHub data={data} />);
    expect(within(screen.getByTestId("week-timeline")).getByRole("button", { name: /Monday, September 21, eating, .*delivery arrives/ })).toBeInTheDocument();
    expect(screen.getByTestId("next-delivery")).toHaveTextContent("Next delivery: Mon, Sep 21, 2 tiffins (Mon + Tue)");
  });
  it("offers the customer's three actions (Edit meal, Move, Change address), no Swap or Hold; Move opens an eating-day picker", () => {
    render(<OrderWeekHub data={data} />);
    expect(screen.queryByRole("button", { name: /^Hold/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Swap/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Edit meal" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change address" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Move to another day" }));
    expect(screen.getByRole("dialog", { name: /Move Mon, Sep 21/ })).toBeInTheDocument();
  });
  it("reschedule shows all eating days in a week picker (week label + arrows); the delivery day is chosen automatically", () => {
    const d2 = { ...data, plan: { ...data.plan, ctx: { ...data.plan.ctx, deliveryWeekdays: ["mon", "tue", "wed", "thu", "fri"] } } } as unknown as OrderWeek;
    // The shared Move sheet reads the wall clock (same as the customer's); pin it to the fixture.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(data.now);
    render(<OrderWeekHub data={d2} />);
    fireEvent.click(screen.getByRole("button", { name: "Move to another day" }));
    const picker = within(within(screen.getByRole("dialog")).getByTestId("week-timeline"));
    expect(picker.getByRole("button", { name: "Next week" })).toBeInTheDocument();
    const sat = picker.getByRole("button", { name: /Saturday, September 26/ });
    expect(sat).not.toHaveAttribute("aria-disabled");
    fireEvent.click(sat);
    expect(screen.getByText(/Sat, Sep 26 will arrive Fri, Sep 25 with Fri|rides the Fri, Sep 25 delivery/)).toBeInTheDocument();
    vi.useRealTimers();
  });
  it("info button explains the trip", () => {
    render(<OrderWeekHub data={data} />);
    fireEvent.click(screen.getByRole("button", { name: "Details for Tue, Sep 22" }));
    expect(screen.getByRole("dialog", { name: /Tue, Sep 22 · meal/ })).toBeInTheDocument();
  });
  it("lets an admin change the delivery status", () => {
    render(<OrderWeekHub data={data} canEditDeliveryStatus />);
    expect(screen.getAllByRole("combobox", { name: "Delivery status" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("combobox", { name: "Delivery status" })[0]).toHaveTextContent("Upcoming");
  });
  it("next week arrow updates ?week via router.replace", () => {
    replace.mockClear();
    render(<OrderWeekHub data={data} />);
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(replace.mock.calls[0]![0]).toContain("week=2026-09-28");
    // The open admin tab survives a week change.
    expect(replace.mock.calls[0]![0]).toContain("tab=deliveries");
  });

  it("gives staff the customer's address action, and no vacation (customer is move-only)", () => {
    render(<OrderWeekHub data={data} />);
    expect(screen.getByRole("button", { name: "Change address" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /vacation|resume deliveries/i })).toBeNull();
  });
});
