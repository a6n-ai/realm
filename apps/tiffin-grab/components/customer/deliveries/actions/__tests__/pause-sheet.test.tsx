// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanView } from "../../adapter";
import { PauseSheet } from "../pause-sheet";

const a = vi.hoisted(() => ({ load: vi.fn(), pause: vi.fn(), release: vi.fn(), auto: vi.fn() }));
vi.mock("@/app/(customer)/me/deliveries/actions", () => ({ loadMyPauseDays: a.load, pauseMyDays: a.pause, releaseMyDays: a.release, setMyAutoMovePaused: a.auto }));

const WED = "2026-09-23";
const THU = "2026-09-24";
const FRI = "2026-09-25";
const MON = "2026-09-28";
const days = (...d: [string, boolean][]) => ({ ok: true, autoMove: false, days: d.map(([date, paused]) => ({ date, paused })) });

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
    fireEvent.click((await screen.findAllByRole("button", { name: /, paused$/ }))[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Resume this delivery" }));
    expect(await screen.findByText("Nothing was resumed.")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    a.release.mockResolvedValueOnce({ ok: true, dates: [THU] });
    fireEvent.click(screen.getAllByRole("button", { name: "Resume all" })[0]!);
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Thu is back on."));
  });

  it("a resumed day that a holiday closed again is a neutral line, not an error", async () => {
    a.load.mockResolvedValue(days([WED, true], [THU, true]));
    a.release.mockResolvedValueOnce({ ok: true, dates: [], reclosed: [{ date: WED, holidayName: "Diwali", placed: true }] });
    const onDone = await open();
    fireEvent.click((await screen.findAllByRole("button", { name: /, paused$/ }))[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Resume this delivery" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Kitchen is closed on Wed, Sep 23 (Diwali). Your tiffin was added to the end of your plan."));
    expect(screen.queryByText("Nothing was resumed.")).toBeNull();
  });

  it("when some days came back and one was closed again, says both", async () => {
    a.load.mockResolvedValue(days([WED, true], [THU, true]));
    a.release.mockResolvedValueOnce({ ok: true, dates: [THU], reclosed: [{ date: WED, holidayName: "Diwali", placed: false }] });
    const onDone = await open();
    fireEvent.click(screen.getAllByRole("button", { name: "Resume all" })[0]!);
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Thu is back on. Kitchen is closed on Wed, Sep 23 (Diwali). We will place your tiffin on a new day."));
  });

  it("empty selection: confirm does nothing and says to choose a day", async () => {
    await open();
    await screen.findByRole("button", { name: /Wed, Sep 23/ });
    expect(confirm()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(confirm());
    expect((await screen.findAllByText("Tap a day to pause or resume it.")).length).toBeGreaterThan(0);
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

  it("limit reached: says so, days cannot be picked, and the confirm button stays off", async () => {
    await open(plan({ maxPauses: 2 }, { count: 2, daysUsed: 3 }));
    expect(await screen.findByText("You've used all your pauses.")).toBeInTheDocument();
    const wed = screen.getByRole("button", { name: /Wed, Sep 23/ });
    expect(wed).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(wed);
    expect(wed).toHaveAttribute("aria-pressed", "false");
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

  it("tapping a paused day resumes that date only", async () => {
    a.load.mockResolvedValue(days([WED, true], [THU, false]));
    a.release.mockResolvedValue({ ok: true, dates: [WED] });
    const onDone = await open();
    fireEvent.click(await screen.findByRole("button", { name: "Wed, Sep 23, paused" }));
    fireEvent.click(screen.getByRole("button", { name: "Resume this delivery" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Wed is back on."));
    expect(a.release).toHaveBeenCalledWith("o", [WED]);
    expect(screen.queryByRole("button", { name: "Resume all" })).toBeNull();
  });

  it("tapping a paused day only marks it; nothing changes until the button is pressed", async () => {
    a.load.mockResolvedValue(days([WED, true], [THU, false]));
    a.release.mockResolvedValue({ ok: true, dates: [WED] });
    const onDone = await open();
    const wed = await screen.findByRole("button", { name: "Wed, Sep 23, paused" });
    fireEvent.click(wed);
    expect(wed).toHaveAttribute("aria-pressed", "true");
    expect(a.release).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(wed);
    expect(wed).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Pause this delivery" })).toHaveAttribute("aria-disabled", "true");
  });

  it("one save pauses the picked days and resumes the picked paused ones, and says both", async () => {
    a.load.mockResolvedValue(days([WED, true], [THU, false], [FRI, false]));
    a.pause.mockResolvedValue({ ok: true, paused: [THU], skipped: [] });
    a.release.mockResolvedValue({ ok: true, dates: [WED] });
    const onDone = await open();
    fireEvent.click(await screen.findByRole("button", { name: "Wed, Sep 23, paused" }));
    fireEvent.click(screen.getByRole("button", { name: /Thu, Sep 24/ }));
    fireEvent.click(screen.getByRole("button", { name: "Pause 1, resume 1" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Paused Thu. Wed is back on."));
    expect(a.pause).toHaveBeenCalledWith("o", [THU]);
    expect(a.release).toHaveBeenCalledWith("o", [WED]);
  });

  it("Pause all pauses every open day in one tap", async () => {
    a.pause.mockResolvedValue({ ok: true, paused: [WED, THU, FRI], skipped: [] });
    const onDone = await open();
    fireEvent.click(await screen.findByRole("button", { name: "Pause all" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Paused Wed, Thu and Fri."));
    expect(a.pause).toHaveBeenCalledWith("o", [WED, THU, FRI]);
  });

  it("Pause all is not offered when the stretch limit is smaller than the open days", async () => {
    await open(plan({ maxPauseStretchDays: 2 }));
    await screen.findByRole("button", { name: /Wed, Sep 23/ });
    expect(screen.queryByRole("button", { name: "Pause all" })).toBeNull();
  });

  it("Resume all appears with two or more paused days and releases them all", async () => {
    a.load.mockResolvedValue(days([WED, true], [THU, true], [MON, true]));
    a.release.mockResolvedValue({ ok: true, dates: [WED, THU, MON] });
    const onDone = await open();
    expect(await screen.findAllByRole("button", { name: /, paused$/ })).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Resume all" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Wed, Thu and Mon are back on."));
    expect(a.release).toHaveBeenCalledWith("o", "all");
  });

  it("a paused day past its cutoff offers Move but never Resume", async () => {
    a.load.mockResolvedValue({ ok: true, autoMove: false, days: [{ date: WED, paused: true, lapsed: true }, { date: THU, paused: true }] });
    const onMove = vi.fn();
    render(<PauseSheet plan={plan()} open onDone={vi.fn()} onMove={onMove} />);
    expect(await screen.findAllByRole("button", { name: /, paused$/ })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Resume all" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Wed, Sep 23, paused past cutoff. Move" }));
    expect(onMove).toHaveBeenCalledWith(WED);
    expect(a.release).not.toHaveBeenCalled();
  });

  it("days off the plan are not buttons; one month shows at a time and arrows page between them", async () => {
    a.load.mockResolvedValue(days([WED, false], ["2026-10-02", false]));
    await open();
    expect(await screen.findByRole("group", { name: "September 2026" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "October 2026" })).toBeNull();
    expect(screen.getAllByRole("button", { pressed: false })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Previous month" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(await screen.findByRole("group", { name: "October 2026" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "September 2026" })).toBeNull();
    expect(screen.getByRole("button", { name: "Next month" })).toBeDisabled();
  });

  it("picks survive paging to another month and back, and one confirm sends both", async () => {
    a.load.mockResolvedValue(days([WED, false], ["2026-10-02", false]));
    a.pause.mockResolvedValue({ ok: true, paused: [WED, "2026-10-02"], skipped: [] });
    await open();
    fireEvent.click(await screen.findByRole("button", { name: /Wed, Sep 23/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    fireEvent.click(await screen.findByRole("button", { name: /Fri, Oct 2/ }));
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(await screen.findByRole("button", { name: /Wed, Sep 23/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Pause 2 deliveries" }));
    await waitFor(() => expect(a.pause).toHaveBeenCalledWith("o", [WED, "2026-10-02"]));
  });

  it("opens on the month of the first open day", async () => {
    a.load.mockResolvedValue(days([WED, true], ["2026-10-02", false]));
    await open();
    expect(await screen.findByRole("group", { name: "October 2026" })).toBeInTheDocument();
  });

  it("the end-of-plan switch shows the saved state and saves a flip", async () => {
    a.load.mockResolvedValue({ ...days([WED, false]), autoMove: false });
    a.auto.mockResolvedValue({ ok: true, on: true, moved: 0 });
    await open();
    const sw = await screen.findByRole("switch", { name: "Add paused days to the end of my plan" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    fireEvent.click(sw);
    await waitFor(() => expect(a.auto).toHaveBeenCalledWith("o", true));
    expect(screen.getByRole("switch", { name: "Add paused days to the end of my plan" })).toHaveAttribute("aria-checked", "true");
  });

  it("turning the switch on says how many past-cutoff days it moved", async () => {
    a.load.mockResolvedValue({ ok: true, autoMove: false, days: [{ date: WED, paused: true, lapsed: true }] });
    a.auto.mockResolvedValue({ ok: true, on: true, moved: 1 });
    const onDone = await open();
    fireEvent.click(await screen.findByRole("switch", { name: "Add paused days to the end of my plan" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Moved 1 paused day to the end of your plan."));
  });

  it("warns, before the switch goes on, that paused days already past cutoff will move too", async () => {
    a.load.mockResolvedValue({ ok: true, autoMove: false, days: [{ date: WED, paused: true, lapsed: true }, { date: THU, paused: true, lapsed: true }] });
    await open();
    expect(await screen.findByText("Turning this on also moves the 2 paused days already past cutoff to the end of your plan.")).toBeInTheDocument();
  });

  it("a refused flip puts the switch back and shows why", async () => {
    a.auto.mockResolvedValue({ error: "This plan is locked." });
    await open();
    fireEvent.click(await screen.findByRole("switch", { name: "Add paused days to the end of my plan" }));
    expect(await screen.findByText("This plan is locked.")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Add paused days to the end of my plan" })).toHaveAttribute("aria-checked", "false");
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
    fireEvent.click(await screen.findByRole("button", { name: "Wed, Sep 23, paused" }));
    fireEvent.click(screen.getByRole("button", { name: "Resume this delivery" }));
    expect(await screen.findByText("That day's cutoff has passed.")).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("a failed load shows the error instead of an empty list", async () => {
    a.load.mockResolvedValue({ error: "Subscription not found" });
    await open();
    expect(await screen.findByText("Subscription not found")).toBeInTheDocument();
  });
});
