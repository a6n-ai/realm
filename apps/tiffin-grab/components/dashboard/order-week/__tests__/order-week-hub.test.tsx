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
  it("menu not released: only the message, no list/delivery/actions, strip stays", () => {
    const out = { ...data, plan: { ...data.plan, days: [{ date: "2026-09-21", menuWeekId: null, meal: null }] } } as unknown as OrderWeek;
    render(<OrderWeekHub data={out} />);
    expect(screen.getByTestId("menu-not-released")).toHaveTextContent("Menu not released yet.");
    expect(screen.queryAllByTestId("trip-row")).toHaveLength(0);
    expect(screen.queryByTestId("next-delivery")).toBeNull();
    expect(screen.getByTestId("week-strip")).toBeInTheDocument();
  });
  it("lists every eating day in a paginated table; a row opens its week", () => {
    replace.mockClear();
    render(<OrderWeekHub data={data} />);
    expect(screen.getAllByTestId("paged-row").length).toBe(3);
    fireEvent.click(screen.getAllByTestId("paged-row")[2]!);
    expect(replace.mock.calls[0]![0]).toContain("week=2026-10-05");
  });
  it("lists eating days of the week; a Mon trip feeds Mon and Tue; Tue names the delivery", () => {
    render(<OrderWeekHub data={data} />);
    expect(screen.getAllByTestId("trip-row")).toHaveLength(2);
    fireEvent.click(screen.getAllByTestId("trip-row")[1]!);
    expect(screen.getByTestId("delivery-block")).toHaveTextContent("Arrives Mon, Sep 21 with Mon");
    expect(screen.getByText(/2 tiffins covering Mon \+ Tue/)).toBeInTheDocument();
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
    expect(screen.getByRole("dialog", { name: /Move Mon, Sep 21/ })).toBeInTheDocument();
  });
  it("reschedule uses a week picker with week label + arrows; only delivery days are pickable", () => {
    const d2 = { ...data, plan: { ...data.plan, ctx: { ...data.plan.ctx, deliveryWeekdays: ["mon", "tue", "wed", "thu", "fri"] } } } as unknown as OrderWeek;
    render(<OrderWeekHub data={d2} />);
    fireEvent.click(screen.getByRole("button", { name: "Reschedule this day" }));
    const picker = within(screen.getByTestId("move-week"));
    expect(picker.getByRole("button", { name: "Next week" })).toBeInTheDocument();
    expect(picker.getByRole("button", { name: /Saturday|Sat, Sep 26, unavailable/ })).toHaveAttribute("aria-disabled", "true");
  });
  it("info button explains the trip", () => {
    render(<OrderWeekHub data={data} />);
    fireEvent.click(screen.getByRole("button", { name: "Details for Tue, Sep 22" }));
    expect(screen.getByRole("dialog", { name: /Tue, Sep 22 · meal/ })).toBeInTheDocument();
  });
  it("next week arrow updates ?week via router.replace", () => {
    replace.mockClear();
    render(<OrderWeekHub data={data} />);
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(replace.mock.calls[0]![0]).toContain("week=2026-09-28");
  });
});
