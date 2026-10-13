// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanView } from "../../adapter";
import { PauseSheet } from "../pause-sheet";

const a = vi.hoisted(() => ({ load: vi.fn(), pause: vi.fn(), release: vi.fn() }));
vi.mock("@/app/(customer)/me/deliveries/actions", () => ({ loadMyPauseDays: a.load, pauseMyDays: a.pause, releaseMyDays: a.release }));

const WED = "2026-09-23";
const THU = "2026-09-24";
const FRI = "2026-09-25";
const MON = "2026-09-28";
const days = (...d: [string, boolean][]) => ({ ok: true, days: d.map(([date, paused]) => ({ date, paused })) });

const plan = (limits: Record<string, number | null> = {}, usage: Record<string, number> = { count: 0, daysUsed: 0 }) =>
  ({ orderId: "o", pause: { limits, usage } }) as unknown as PlanView;

const open = async (p = plan(), onDone = vi.fn()) => {
  render(<PauseSheet plan={p} open onDone={onDone} />);
  await waitFor(() => expect(a.load).toHaveBeenCalled());
  return onDone;
};
const confirm = () => screen.getByRole("button", { name: /^Pause( this| \d+)? deliver/ });

beforeEach(() => {
  Object.values(a).forEach((f) => f.mockReset());
  a.load.mockResolvedValue(days([WED, false], [THU, false], [FRI, false]));
});
afterEach(cleanup);

describe("PauseSheet", () => {
  it("lists only the plan's pausable delivery days, and nothing else", async () => {
    await open();
    expect(await screen.findByRole("button", { name: /Wed, Sep 23/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /Sat, Sep 26/ })).toBeNull();
    expect(a.load).toHaveBeenCalledWith("o");
  });

  it("multi-select, then one confirm pauses exactly those dates and says it in one line", async () => {
    a.pause.mockResolvedValue({ ok: true, paused: [WED, THU], skipped: [] });
    const onDone = await open();
    fireEvent.click(await screen.findByRole("button", { name: /Wed, Sep 23/ }));
    fireEvent.click(screen.getByRole("button", { name: /Thu, Sep 24/ }));
    fireEvent.click(screen.getByRole("button", { name: "Pause 2 deliveries" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Paused Wed and Thu."));
    expect(a.pause).toHaveBeenCalledWith("o", [WED, THU]);
  });

  it("the line says what the server paused, not what was picked", async () => {
    a.pause.mockResolvedValue({ ok: true, paused: [THU], skipped: [WED] });
    const onDone = await open();
    fireEvent.click(await screen.findByRole("button", { name: /Wed, Sep 23/ }));
    fireEvent.click(screen.getByRole("button", { name: /Thu, Sep 24/ }));
    fireEvent.click(screen.getByRole("button", { name: "Pause 2 deliveries" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Paused Thu. Wed was already past cutoff."));
  });

  it("a pause that changed nothing is an error, not a success", async () => {
    a.pause.mockResolvedValue({ ok: true, paused: [], skipped: [WED] });
    const onDone = await open();
    fireEvent.click(await screen.findByRole("button", { name: /Wed, Sep 23/ }));
    fireEvent.click(confirm());
    expect(await screen.findByText(/Nothing was paused/)).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("a resume that changed nothing is an error, and a partial one names only the days put back", async () => {
    a.load.mockResolvedValue(days([WED, true], [THU, true]));
    a.release.mockResolvedValueOnce({ ok: true, dates: [] });
    const onDone = await open();
    fireEvent.click((await screen.findAllByRole("button", { name: "Resume this day" }))[0]!);
    expect(await screen.findByText("Nothing was resumed.")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    a.release.mockResolvedValueOnce({ ok: true, dates: [THU] });
    fireEvent.click(screen.getAllByRole("button", { name: "Resume all" })[0]!);
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Thu is back on."));
  });

  it("empty selection: confirm does nothing and says to choose a day", async () => {
    await open();
    await screen.findByRole("button", { name: /Wed, Sep 23/ });
    expect(confirm()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(confirm());
    expect((await screen.findAllByText("Choose a delivery day.")).length).toBeGreaterThan(0);
    expect(a.pause).not.toHaveBeenCalled();
  });

  it("shows no budget line without a limit, and one when a limit exists", async () => {
    await open();
    await screen.findByRole("button", { name: /Wed, Sep 23/ });
    expect(screen.queryByText(/pauses? left|pause days used|at a time/)).toBeNull();
    cleanup();
    await open(plan({ maxPauses: 3, maxPauseDaysTotal: 10, maxPauseStretchDays: 4 }, { count: 1, daysUsed: 2 }));
    expect(await screen.findByText("2 pauses left")).toBeInTheDocument();
    expect(screen.getByText("2 of 10 pause days used")).toBeInTheDocument();
    expect(screen.getByText("Up to 4 days at a time")).toBeInTheDocument();
  });

  it("limit reached: says so, lists nothing to pick, and the confirm button stays off", async () => {
    await open(plan({ maxPauses: 2 }, { count: 2, daysUsed: 3 }));
    expect(await screen.findByText("You've used all your pauses.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Wed, Sep 23/ })).toBeNull();
    expect(confirm()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(confirm());
    expect(a.pause).not.toHaveBeenCalled();
  });

  it("selection cannot grow past the stretch limit", async () => {
    await open(plan({ maxPauseStretchDays: 2 }));
    for (const n of [/Wed, Sep 23/, /Thu, Sep 24/, /Fri, Sep 25/]) fireEvent.click(await screen.findByRole("button", { name: n }));
    expect(screen.getByRole("button", { name: "Pause 2 deliveries" })).toBeInTheDocument();
  });

  it("nothing pausable: says so and offers no confirm that works", async () => {
    a.load.mockResolvedValue(days());
    await open();
    expect(await screen.findByText("No upcoming deliveries can be paused.")).toBeInTheDocument();
    fireEvent.click(confirm());
    expect(a.pause).not.toHaveBeenCalled();
  });

  it("Resume this day releases that date only", async () => {
    a.load.mockResolvedValue(days([WED, true], [THU, false]));
    a.release.mockResolvedValue({ ok: true, dates: [WED] });
    const onDone = await open();
    fireEvent.click(await screen.findByRole("button", { name: "Resume this day" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Wed is back on."));
    expect(a.release).toHaveBeenCalledWith("o", [WED]);
    expect(screen.queryByRole("button", { name: "Resume all" })).toBeNull();
  });

  it("Resume all appears with two or more paused days and releases them all", async () => {
    a.load.mockResolvedValue(days([WED, true], [THU, true], [MON, true]));
    a.release.mockResolvedValue({ ok: true, dates: [WED, THU, MON] });
    const onDone = await open();
    expect(await screen.findAllByRole("button", { name: "Resume this day" })).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Resume all" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Wed, Thu and Mon are back on."));
    expect(a.release).toHaveBeenCalledWith("o", "all");
  });

  it("a refused pause shows the server's words and the sheet stays open", async () => {
    a.pause.mockResolvedValue({ error: "You can pause at most 2 days at a time." });
    const onDone = await open();
    fireEvent.click(await screen.findByRole("button", { name: /Wed, Sep 23/ }));
    fireEvent.click(confirm());
    expect(await screen.findByText("You can pause at most 2 days at a time.")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("a refused resume shows the server's words and the sheet stays open", async () => {
    a.load.mockResolvedValue(days([WED, true]));
    a.release.mockResolvedValue({ error: "That day's cutoff has passed." });
    const onDone = await open();
    fireEvent.click(await screen.findByRole("button", { name: "Resume this day" }));
    expect(await screen.findByText("That day's cutoff has passed.")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("a failed load shows the error instead of an empty list", async () => {
    a.load.mockResolvedValue({ error: "Subscription not found" });
    await open();
    expect(await screen.findByText("Subscription not found")).toBeInTheDocument();
  });
});
