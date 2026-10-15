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
const rel = vi.hoisted(() => vi.fn());
const pse = vi.hoisted(() => vi.fn());
vi.mock("@/app/(customer)/me/deliveries/actions", () => ({
  applyMyDeliverySwap: vi.fn(), pauseMyDays: pse, loadMyPauseDays: vi.fn(async () => ({ ok: true, days: [] })), releaseMyDays: rel, removeMyDeliverySwap: vi.fn(), rescheduleMyDelivery: vi.fn(),
  scheduleMyPooledTiffin: vi.fn(), unskipMyDelivery: vi.fn(),
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
  it("a free tiffin says so, with staff's note, in the day block and the eating-days table", () => {
    render(<OrderWeekHub data={{ ...data, trips: [{ ...mon, complimentaryNote: "Missed Oct 5" }] } as OrderWeek} />);
    expect(screen.getByTestId("complimentary-note")).toHaveTextContent("Free tiffinMissed Oct 5");
    expect(within(screen.getAllByTestId("paged-row")[0]!).getByText("Free")).toBeInTheDocument();
  });
  it("a Mon trip feeds Mon and Tue; picking Tue in the strip names the delivery that carries it", () => {
    render(<OrderWeekHub data={data} />);
    fireEvent.click(within(screen.getByTestId("week-timeline")).getByRole("button", { name: /Tuesday, September 22/ }));
    const block = screen.getByTestId("delivery-block");
    expect(block).toHaveTextContent("Tue, Sep 22");
    expect(block).toHaveTextContent("Comes with the Mon, Sep 21 delivery");
    expect(block).toHaveTextContent("2 tiffins (1 Mon + 1 Tue)");
  });
  it("matrix shows every week of the plan; a box in this week selects it, one in another week navigates there", () => {
    replace.mockClear();
    render(<OrderWeekHub data={data} />);
    const matrix = within(screen.getByTestId("delivery-matrix"));
    expect(matrix.getByText(/2 deliveries · 3 weeks/)).toBeInTheDocument();
    expect(matrix.getAllByRole("button")).toHaveLength(3);
    fireEvent.click(matrix.getByRole("button", { name: /Tuesday, September 22, Upcoming$/ }));
    expect(screen.getByTestId("delivery-block")).toHaveTextContent("Tue, Sep 22");
    fireEvent.click(matrix.getByRole("button", { name: /Monday, October 5, Upcoming, delivery with 1 tiffin/ }));
    expect(replace.mock.calls[0]![0]).toContain("week=2026-10-05");
    expect(replace.mock.calls[0]![0]).toContain("trip=2026-10-05");
  });
  it("matrix uses the status dropdown's states: awaiting confirmation past the cutoff, and OptimoRoute's not delivered apart from an admin hold", () => {
    const dot = (date: string, over: object) => [{ orderId: "o", status: "scheduled", cutoffAt: NOW - 1, deliveryDate: date, truck: true, units: 1, covers: [date], ...over }];
    const agenda = {
      "2026-09-21": dot("2026-09-21", {}),
      "2026-09-22": dot("2026-09-22", { status: "skipped", optimoCompletionStatus: "failed" }),
      "2026-09-23": dot("2026-09-23", { status: "skipped" }),
    };
    render(<OrderWeekHub data={{ ...data, agenda } as unknown as OrderWeek} />);
    const matrix = within(screen.getByTestId("delivery-matrix"));
    expect(matrix.getByRole("button", { name: /September 21, Awaiting confirmation/ })).toBeInTheDocument();
    expect(matrix.getByRole("button", { name: /September 22, Not delivered/ })).toBeInTheDocument();
    expect(matrix.getByRole("button", { name: /September 23, On hold/ })).toBeInTheDocument();
  });
  it("strip marks the delivery day; no separate next-delivery banner (the card is the delivery)", () => {
    render(<OrderWeekHub data={data} />);
    expect(within(screen.getByTestId("week-timeline")).getByRole("button", { name: /Monday, September 21, eating, .*delivery arrives/ })).toBeInTheDocument();
    expect(screen.queryByTestId("next-delivery")).toBeNull();
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
  it("a finished plan still lists its days but offers no action", () => {
    render(<OrderWeekHub data={data} canEditDeliveryStatus readOnly />);
    expect(screen.getByText(/tiffins left/)).toBeInTheDocument();
    for (const name of ["Edit meal", "Change address", "Move to another day", "Pause multiple days"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    // No delivery status select: the only dropdown left is the table's page size.
    expect(screen.queryAllByRole("combobox").map((c) => c.getAttribute("aria-label"))).toEqual(["Rows per page"]);
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
    expect(screen.getByText("Arrives Fri, Sep 25")).toBeInTheDocument();
    vi.useRealTimers();
  });
  it("info button explains the trip", () => {
    render(<OrderWeekHub data={data} />);
    fireEvent.click(within(screen.getByTestId("week-timeline")).getByRole("button", { name: /Tuesday, September 22/ }));
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

  it("pause is the same control; on hold appears only for an admin", () => {
    const held = {
      ...mon,
      status: "failed" as const,
      units: 1,
      coversDates: ["2026-09-21"],
      coversLabel: null,
      eatingDays: [day("2026-09-21", "Dal")],
    };
    const heldData = { ...data, trips: [held] } as unknown as OrderWeek;
    render(<OrderWeekHub data={heldData} />);
    expect(screen.getByRole("button", { name: "Pause multiple days" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Release hold|On hold/ })).toBeNull();
    expect(screen.getAllByRole("button", { name: /Move to another day/ }).length).toBeGreaterThan(0);
    cleanup();
    render(<OrderWeekHub data={heldData} canEditDeliveryStatus />);
    expect(screen.getByRole("button", { name: "Release hold to a new day" })).toBeTruthy();
    expect(screen.getAllByRole("combobox", { name: "Delivery status" }).length).toBeGreaterThan(0);
  });
  it("staff wording for a hold in the eating-days table is On hold, a paused day says Paused", () => {
    const row = (status: string) => [{ orderId: "o", status, cutoffAt: NOW - 3600e3, deliveryDate: "2026-09-21", truck: true, units: 1, covers: ["2026-09-21"], deliveryId: "x" }];
    render(<OrderWeekHub data={{ ...data, agenda: { ...data.agenda, "2026-09-21": row("skipped") } } as unknown as OrderWeek} />);
    expect(within(screen.getAllByTestId("paged-row")[0]!).getByText("On hold")).toBeInTheDocument();
    cleanup();
    render(<OrderWeekHub data={{ ...data, agenda: { ...data.agenda, "2026-09-21": row("paused") } } as unknown as OrderWeek} />);
    expect(within(screen.getAllByTestId("paged-row")[0]!).getByText("Paused")).toBeInTheDocument();
  });
  describe("pause", () => {
    const paused = { ...mon, status: "paused" as const, deliveryId: "d1" };
    const pdot = (date: string) => [date, [{ orderId: "o", status: "paused", cutoffAt: NOW + 30 * 3600e3, deliveryDate: date, truck: true, units: 1, covers: [date], deliveryId: `x-${date}` }]] as const;
    const withPaused = (n: number, over: object = {}) => ({
      ...data,
      trips: [paused],
      agenda: { ...data.agenda, ...Object.fromEntries([pdot("2026-09-21"), ...(n > 1 ? [pdot("2026-09-23")] : [])]) },
      plan: { ...data.plan, ...over },
    }) as unknown as OrderWeek;
    it("a paused day offers Resume this day beside Move, the same as the customer's card", () => {
      render(<OrderWeekHub data={withPaused(1)} />);
      expect(screen.getByRole("button", { name: "Resume this day" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Move to another day" })).toBeInTheDocument();
      // Plan-wide, beside Pause multiple days; one paused day is enough.
      expect(screen.getByRole("button", { name: "Resume all" })).toBeEnabled();
    });
    it("Resume all is always there, disabled while nothing is paused", () => {
      render(<OrderWeekHub data={data} />);
      expect(screen.getByRole("button", { name: "Resume all" })).toBeDisabled();
    });
    it("an upcoming day offers Pause this day, which pauses only that date", async () => {
      pse.mockReset();
      pse.mockResolvedValue({ ok: true, paused: ["2026-09-21"], skipped: [] });
      render(<OrderWeekHub data={data} />);
      fireEvent.click(screen.getByRole("button", { name: "Pause this day" }));
      await vi.waitFor(() => expect(pse).toHaveBeenCalledWith("o", ["2026-09-21"]));
    });
    it("Resume all first warns about a paused day past its cutoff, then resumes the rest on request", async () => {
      rel.mockReset();
      rel.mockResolvedValue({ ok: true, dates: ["2026-09-21", "2026-09-23"] });
      const past = { orderId: "o", status: "skipped", lapsedPause: true, cutoffAt: 1, deliveryDate: "2026-09-18", truck: true, units: 1, covers: ["2026-09-18"], deliveryId: "x-past" };
      const d = withPaused(2);
      render(<OrderWeekHub data={{ ...d, agenda: { ...d.agenda, "2026-09-18": [past] } } as unknown as OrderWeek} />);
      fireEvent.click(screen.getByRole("button", { name: "Resume all" }));
      expect(await screen.findByText(/Fri, Sep 18 is past cutoff/)).toBeInTheDocument();
      expect(rel).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Only resume the rest" }));
      await vi.waitFor(() => expect(rel).toHaveBeenCalledWith("o", "all"));
    });
    it("paused days ahead: Resume all releases them all", async () => {
      rel.mockReset();
      rel.mockResolvedValue({ ok: true, dates: ["2026-09-21", "2026-09-23"] });
      render(<OrderWeekHub data={withPaused(2)} />);
      fireEvent.click(screen.getByRole("button", { name: "Resume all" }));
      await vi.waitFor(() => expect(rel).toHaveBeenCalledWith("o", "all"));
    });
    it("Resume this day releases the selected date", async () => {
      rel.mockReset();
      rel.mockResolvedValue({ ok: true, dates: ["2026-09-21"] });
      render(<OrderWeekHub data={withPaused(1)} />);
      fireEvent.click(screen.getByRole("button", { name: "Resume this day" }));
      await vi.waitFor(() => expect(rel).toHaveBeenCalledWith("o", ["2026-09-21"]));
    });
    it("a day past cutoff has no Resume (the hold is the after-cutoff tool)", () => {
      const lapsed = { ...mon, status: "failed" as const, lapsedPause: true };
      render(<OrderWeekHub data={{ ...data, trips: [lapsed] } as unknown as OrderWeek} />);
      expect(screen.queryByRole("button", { name: "Resume this day" })).toBeNull();
    });
    it("a trial plan has no Pause", () => {
      render(<OrderWeekHub data={{ ...data, plan: { ...data.plan, sub: { ...data.plan.sub, trial: true } } } as unknown as OrderWeek} />);
      expect(screen.queryByRole("button", { name: /^Pause/ })).toBeNull();
    });
    it("a fully paused plan reads that way next to its (still active) status", () => {
      render(<OrderWeekHub data={withPaused(1, { sub: { ...data.plan.sub, fullyPaused: true } })} />);
      expect(screen.getByText("All upcoming days paused")).toBeInTheDocument();
    });
  });
});

describe("OrderWeekHub on a holiday", () => {
  it("labels a closed day Holiday, never Upcoming", () => {
    const agenda = { "2026-09-21": [{ orderId: "o", status: "paused", cutoffAt: NOW + 1000, deliveryDate: "2026-09-21", truck: false, units: 1, covers: ["2026-09-21"], holiday: "Diwali" }] };
    render(<OrderWeekHub data={{ ...data, agenda } as unknown as OrderWeek} />);
    const row = screen.getAllByTestId("paged-row")[0]!;
    expect(row).toHaveTextContent("Holiday");
    expect(row).not.toHaveTextContent("Upcoming");
    expect(row).not.toHaveTextContent(/With .* delivery|Arrives/);
  });

  it("the selected closed day shows the holiday note for staff, and a held one says to place it", () => {
    const heldDot = { orderId: "o", status: "skipped", cutoffAt: NOW - 1000, deliveryDate: "2026-09-21", truck: true, units: 1, covers: ["2026-09-21"], holiday: "Thanksgiving" };
    const held: Trip = { ...mon, status: "failed", coversDates: ["2026-09-21"], eatingDays: [mon.eatingDays[0]!], holidayName: "Thanksgiving", cutoffAt: NOW - 1000 };
    render(<OrderWeekHub data={{ ...data, trips: [held], agenda: { "2026-09-21": [heldDot] } } as unknown as OrderWeek} />);
    fireEvent.click(within(screen.getByTestId("week-timeline")).getByRole("button", { name: /Monday, September 21/ }));
    const block = screen.getByTestId("delivery-block");
    expect(within(block).getByTestId("holiday-note")).toHaveTextContent("Holiday: Thanksgiving");
    expect(within(block).getByTestId("holiday-note")).toHaveTextContent("The kitchen was closed that day. Place this tiffin on another day.");
    expect(block).toHaveTextContent("Holiday");
    expect(block).not.toHaveTextContent("Not delivered");
  });

  it("an admin who can edit statuses gets no status dropdown on a held holiday day, and nothing on the card reads On hold, Not delivered or Upcoming", () => {
    const heldDot = { orderId: "o", status: "skipped", cutoffAt: NOW - 1000, deliveryDate: "2026-09-21", truck: true, units: 1, covers: ["2026-09-21"], holiday: "Thanksgiving" };
    const held: Trip = { ...mon, status: "failed", coversDates: ["2026-09-21"], eatingDays: [mon.eatingDays[0]!], holidayName: "Thanksgiving", cutoffAt: NOW - 1000 };
    render(<OrderWeekHub canEditDeliveryStatus data={{ ...data, trips: [held], agenda: { "2026-09-21": [heldDot] } } as unknown as OrderWeek} />);
    fireEvent.click(within(screen.getByTestId("week-timeline")).getByRole("button", { name: /Monday, September 21/ }));
    const block = screen.getByTestId("delivery-block");
    expect(within(block).queryByRole("combobox")).toBeNull();
    expect(block).toHaveTextContent("Holiday");
    expect(block).not.toHaveTextContent(/On hold|Not delivered|Upcoming/);
    expect(within(block).getByTestId("holiday-note")).toHaveTextContent("Place this tiffin on another day.");
  });
});
