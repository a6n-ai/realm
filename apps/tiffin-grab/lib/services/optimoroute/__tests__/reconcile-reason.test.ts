import { describe, expect, it } from "vitest";
import { reconcileReason, type OptimoSide, type OurSide } from "../reconcile-reason";

const ours = (o: Partial<OurSide> = {}): OurSide => ({
  status: "scheduled",
  optimoCompletionStatus: null,
  optimoCompletionNote: null,
  mergedIntoDate: null,
  moved: false,
  everPushed: true,
  ...o,
});
const stop = (o: Partial<NonNullable<OptimoSide>> = {}): OptimoSide => ({
  status: "scheduled",
  driver: "Driver 4",
  stopNumber: 7,
  matchedBy: "orderNo",
  ...o,
});

describe("reconcileReason", () => {
  it.each([
    ["planned on a route", ours(), stop(), "on_route", "Planned — Driver 4, stop 7", undefined],
    ["matched by phone", ours(), stop({ matchedBy: "phone" }), "on_route", "Planned — Driver 4, stop 7 (matched by phone)", undefined],
    ["recorded delivered", ours({ optimoCompletionStatus: "success" }), stop({ status: "success" }), "done", "Delivered", undefined],
    ["OptimoRoute success not yet pulled", ours(), stop({ status: "success" }), "done", "Delivered on OptimoRoute — not recorded yet", undefined],
    ["driver failed", ours(), stop({ status: "failed" }), "done", "Not delivered (driver reported failed)", undefined],
    ["held after a failed drop", ours({ status: "skipped", optimoCompletionStatus: "failed", optimoCompletionNote: "No answer" }), null, "done", "Not delivered — No answer", undefined],
    ["never sent", ours({ everPushed: false }), null, "needs_action", "Not sent to OptimoRoute yet", "send"],
    ["sent then vanished", ours(), null, "needs_action", "Was sent, no longer on OptimoRoute", "send"],
    ["sent, not planned", ours(), stop({ status: "unscheduled", driver: null, stopNumber: null }), "needs_action", "Sent, not planned on a route", "review"],
    ["planned with no driver", ours(), stop({ driver: null }), "needs_action", "Sent, not planned on a route", "review"],
    ["rejected", ours(), stop({ status: "rejected" }), "needs_action", "Rejected by driver", "review"],
    ["stale hold", ours({ status: "skipped" }), stop(), "cleanup", "Stale — on OptimoRoute but On hold here", "remove"],
    ["stale pause", ours({ status: "paused" }), stop(), "cleanup", "Stale — on OptimoRoute but Paused here", "remove"],
    ["on hold", ours({ status: "skipped" }), null, "not_today", "On hold", undefined],
    ["paused", ours({ status: "paused" }), null, "not_today", "Paused", undefined],
    ["cancelled", ours({ status: "cancelled" }), null, "not_today", "Cancelled", undefined],
    ["merged", ours({ mergedIntoDate: "2026-10-07" }), null, "not_today", "Merged into the 2026-10-07 trip", undefined],
    ["merged but still on OptimoRoute", ours({ mergedIntoDate: "2026-10-07" }), stop(), "cleanup", "Merged into the 2026-10-07 trip but still on OptimoRoute", "review"],
    ["merged and its stop is closed", ours({ mergedIntoDate: "2026-10-07" }), stop({ status: "success" }), "not_today", "Merged into the 2026-10-07 trip", undefined],
    ["moved", ours({ status: "skipped", moved: true }), null, "not_today", "Moved to a make-up day", undefined],
    // Past day: Needs action is the Missed deliveries tab.
    ["past day, never closed (T-Stash)", ours({ missed: true }), stop(), "needs_action", "Not marked delivered — Planned — Driver 4, stop 7", "review"],
    ["past day, success not pulled", ours({ missed: true }), stop({ status: "success" }), "needs_action", "Delivered on OptimoRoute — not recorded yet", "review"],
    ["past day, failed not pulled", ours({ missed: true }), stop({ status: "failed" }), "needs_action", "Not delivered (driver reported failed)", "review"],
    ["past day, never sent", ours({ missed: true, everPushed: false }), null, "needs_action", "Not sent to OptimoRoute yet", "send"],
    ["past day, nothing owed", ours({ missed: false }), null, "done", "Nothing owed — made up or no tiffins", undefined],
    ["past day, recorded delivered", ours({ missed: false, optimoCompletionStatus: "success" }), stop(), "done", "Delivered", undefined],
    ["past day, stale stays cleanup", ours({ status: "paused", missed: null }), stop(), "cleanup", "Stale — on OptimoRoute but Paused here", "remove"],
  ] as const)("%s", (_name, o, s, group, text, action) => {
    expect(reconcileReason(o, s)).toEqual({ group, text, ...(action ? { action } : {}) });
  });
});
