// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Trip } from "@/lib/deliveries-view";
import type { OrderWeek } from "@/lib/services/order-week.service";
import { OrderWeekHub } from "../order-week-hub";
import { BOX_LABEL, boxStatus } from "../order-month-calendar";

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
const sds = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => ({ ok: true, message: "Delivery status updated" })));
vi.mock("@/app/(dashboard)/dashboard/orders/[id]/actions", () => ({ setDeliveryStatusAction: sds }));
// The ReUI calendar is exercised in the browser; here a stub with one button per agenda day drives the hub.
vi.mock("../order-month-calendar", async (orig) => {
  const real = await orig<typeof import("../order-month-calendar")>();
  return {
    ...real,
    OrderMonthCalendar: ({ agenda, now, selectedDay, onPickDay }: { agenda: Record<string, Parameters<typeof real.boxStatus>[0][]>; now: number; selectedDay: string | null; onPickDay: (iso: string) => void }) => (
      <div data-testid="month-calendar">
        {Object.entries(agenda).map(([d, ds]) => (
          <button key={d} type="button" aria-pressed={d === selectedDay} onClick={() => onPickDay(d)}>{`${d}, ${real.BOX_LABEL[real.boxStatus(ds[0]!, now)]}`}</button>
        ))}
      </div>
    ),
  };
});
const pick = (iso: string) => fireEvent.click(within(screen.getByTestId("month-calendar")).getByRole("button", { name: new RegExp(`^${iso},`) }));
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

describe("OrderWeekHub (admin, shadcn)", () => {
  it("menu not released: notice shows, but days stay listed and movable (customer parity)", () => {
    const out = { ...data, plan: { ...data.plan, days: [{ date: "2026-09-21", menuWeekId: null, meal: null }] } } as unknown as OrderWeek;
    render(<OrderWeekHub data={out} />);
    expect(screen.getByTestId("menu-not-released")).toHaveTextContent("Menu not released yet.");
    expect(screen.getByRole("button", { name: "Move to another day" })).toBeTruthy();
    expect(screen.getByTestId("month-calendar")).toBeInTheDocument();
  });
  it("a free tiffin says so, with staff's note, in the day panel", () => {
    render(<OrderWeekHub data={{ ...data, trips: [{ ...mon, complimentaryNote: "Missed Oct 5" }] } as OrderWeek} />);
    expect(screen.getByTestId("complimentary-note")).toHaveTextContent("Free tiffinMissed Oct 5");
  });
  it("a Mon trip feeds Mon and Tue; picking Tue on the calendar names the delivery that carries it", () => {
    render(<OrderWeekHub data={data} />);
    pick("2026-09-22");
    const block = screen.getByTestId("delivery-block");
    expect(block).toHaveTextContent("Tue, Sep 22");
    expect(block).toHaveTextContent("Comes with the Mon, Sep 21 delivery");
    expect(block).toHaveTextContent("2 tiffins (1 Mon + 1 Tue)");
  });
  it("the calendar is the only navigator: a day in this week selects it, one in another week navigates there and keeps the tab", () => {
    replace.mockClear();
    render(<OrderWeekHub data={data} />);
    expect(screen.queryByTestId("week-timeline")).toBeNull();
    pick("2026-09-22");
    expect(screen.getByTestId("delivery-block")).toHaveTextContent("Tue, Sep 22");
    expect(within(screen.getByTestId("month-calendar")).getByRole("button", { name: /^2026-09-22,/ })).toHaveAttribute("aria-pressed", "true");
    expect(replace).not.toHaveBeenCalled();
    pick("2026-10-05");
    expect(replace.mock.calls[0]![0]).toContain("week=2026-10-05");
    expect(replace.mock.calls[0]![0]).toContain("trip=2026-10-05");
    expect(replace.mock.calls[0]![0]).toContain("tab=deliveries");
  });
  it("calendar chips use the status dropdown's states: awaiting past the cutoff, OptimoRoute's not delivered apart from a hold, Paused, Holiday", () => {
    const dot = (over: object) => ({ orderId: "o", status: "scheduled", cutoffAt: NOW - 1, deliveryDate: "2026-09-21", truck: true, units: 1, covers: [], ...over }) as Parameters<typeof boxStatus>[0];
    const label = (over: object) => BOX_LABEL[boxStatus(dot(over), NOW)];
    expect(label({})).toBe("Awaiting confirmation");
    expect(label({ cutoffAt: NOW + 1 })).toBe("Upcoming");
    expect(label({ status: "skipped", optimoCompletionStatus: "failed" })).toBe("Not delivered");
    expect(label({ status: "skipped" })).toBe("On hold");
    expect(label({ status: "paused" })).toBe("Paused");
    expect(label({ status: "paused", holiday: "Diwali" })).toBe("Holiday");
  });
  it("the day's stepper shows its stage and what each stop is waiting on, with the driver once routed", () => {
    render(<OrderWeekHub data={data} routing={[{ publicId: "d1", deliveryDate: "2026-09-21", status: "scheduled", routeDriverName: "Ravi", routeSyncedAt: 1 }]} />);
    const journey = screen.getByTestId("journey");
    expect(journey).toHaveAttribute("aria-label", "Scheduled delivery");
    expect(journey).toHaveTextContent("Changes until");
    expect(journey).toHaveTextContent("Driver Ravi");
    expect(journey).toHaveTextContent("Due Mon, Sep 21");
  });
  it("More shows the delivery ID and the OptimoRoute push for that day", () => {
    render(<OrderWeekHub data={data} routing={[{ publicId: "d1", deliveryDate: "2026-09-21", status: "scheduled", routeDriverName: null, routeSyncedAt: null }]} />);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByTestId("delivery-id")).toHaveTextContent("d1");
    expect(within(screen.getByTestId("route-controls")).getByRole("button", { name: "Push" })).toBeEnabled();
    expect(within(screen.getByTestId("route-controls")).getByRole("button", { name: "Remove" })).toBeDisabled();
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
    expect(screen.queryAllByRole("combobox")).toEqual([]);
    expect(screen.queryByTestId("status-card")).toBeNull();
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
    pick("2026-09-22");
    fireEvent.click(screen.getByRole("button", { name: "Details for Tue, Sep 22" }));
    expect(screen.getByRole("dialog", { name: /Tue, Sep 22 · meal/ })).toBeInTheDocument();
  });
  describe("status card", () => {
    // Same day as NOW, cutoff passed: the driver should have confirmed it by now.
    const due = { ...mon, cutoffAt: NOW - 1 };
    const dueData = { ...data, trips: [due], agenda: { ...data.agenda, "2026-09-21": [{ ...data.agenda["2026-09-21"]![0]!, cutoffAt: NOW - 1 }] } } as unknown as OrderWeek;
    it("before the cutoff it says there is nothing to confirm and offers no status buttons", () => {
      render(<OrderWeekHub data={data} canEditDeliveryStatus />);
      const card = within(screen.getByTestId("status-card"));
      expect(card.getByText("Upcoming")).toBeInTheDocument();
      expect(card.getByText("Nothing to confirm yet.")).toBeInTheDocument();
      expect(card.queryAllByRole("button")).toEqual([]);
    });
    it("on the day, past the cutoff: Mark delivered saves delivered", async () => {
      sds.mockClear();
      render(<OrderWeekHub data={dueData} canEditDeliveryStatus />);
      const card = within(screen.getByTestId("status-card"));
      expect(card.getByText("Awaiting confirmation")).toBeInTheDocument();
      fireEvent.click(card.getByRole("button", { name: "Mark delivered" }));
      await vi.waitFor(() => expect(sds).toHaveBeenCalledWith("d1", "delivered"));
    });
    it("Mark not delivered asks first, then saves not_delivered", async () => {
      sds.mockClear();
      render(<OrderWeekHub data={dueData} canEditDeliveryStatus />);
      fireEvent.click(within(screen.getByTestId("status-card")).getByRole("button", { name: "Mark not delivered…" }));
      expect(sds).not.toHaveBeenCalled();
      fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Mark not delivered" }));
      await vi.waitFor(() => expect(sds).toHaveBeenCalledWith("d1", "not_delivered"));
    });
    it("a delivered day offers Undo, which sets it back", async () => {
      sds.mockClear();
      render(<OrderWeekHub data={{ ...data, trips: [{ ...mon, status: "delivered" }] } as unknown as OrderWeek} canEditDeliveryStatus />);
      const card = within(screen.getByTestId("status-card"));
      expect(card.getByText("Delivered")).toBeInTheDocument();
      fireEvent.click(card.getByRole("button", { name: "Undo" }));
      await vi.waitFor(() => expect(sds).toHaveBeenCalledWith("d1", "upcoming"));
    });
    it("the banner counts deliveries waiting for confirmation, for staff who can settle them", () => {
      render(<OrderWeekHub data={dueData} canEditDeliveryStatus />);
      expect(screen.getByTestId("needs-action")).toHaveTextContent("1 delivery is waiting for confirmation.");
      cleanup();
      render(<OrderWeekHub data={dueData} />);
      expect(screen.queryByTestId("needs-action")).toBeNull();
    });
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
    expect(within(screen.getByTestId("status-card")).getByText("On hold")).toBeInTheDocument();
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
  it("the selected closed day shows the holiday note for staff, and a held one says to place it", () => {
    const heldDot = { orderId: "o", status: "skipped", cutoffAt: NOW - 1000, deliveryDate: "2026-09-21", truck: true, units: 1, covers: ["2026-09-21"], holiday: "Thanksgiving" };
    const held: Trip = { ...mon, status: "failed", coversDates: ["2026-09-21"], eatingDays: [mon.eatingDays[0]!], holidayName: "Thanksgiving", cutoffAt: NOW - 1000 };
    render(<OrderWeekHub data={{ ...data, trips: [held], agenda: { "2026-09-21": [heldDot] } } as unknown as OrderWeek} />);
    pick("2026-09-21");
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
    pick("2026-09-21");
    const block = screen.getByTestId("delivery-block");
    expect(within(block).queryByTestId("status-card")).toBeNull();
    expect(block).toHaveTextContent("Holiday");
    expect(block).not.toHaveTextContent(/On hold|Not delivered|Upcoming/);
    expect(within(block).getByTestId("holiday-note")).toHaveTextContent("Place this tiffin on another day.");
  });
});
