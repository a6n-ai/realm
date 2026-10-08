import { describe, expect, it } from "vitest";
import { completionAction, leaveReason, phoneMatches, reportsUnmatched } from "../completions";

const scheduled = { status: "scheduled" as const, optimoCompletionStatus: null };
const skipped = { status: "skipped" as const, optimoCompletionStatus: null };

describe("completionAction", () => {
  it("records a success and puts a skipped day back", () => {
    expect(completionAction(scheduled, "success", false)).toBe("confirm");
    expect(completionAction(skipped, "success", false)).toBe("restore");
  });

  it("skips only a scheduled stop OptimoRoute reported failed", () => {
    expect(completionAction(scheduled, "failed", false)).toBe("skip");
    expect(completionAction(skipped, "failed", false)).toBe("leave");
  });

  it("leaves an open stop alone, cutoff or not", () => {
    expect(completionAction(scheduled, null, false)).toBe("pending");
    expect(completionAction(scheduled, "scheduled", false)).toBe("pending");
    expect(completionAction(skipped, null, false)).toBe("pending");
    expect(completionAction(scheduled, "rejected", false)).toBe("pending");
  });

  it("does not undo a success already stored on a scheduled day", () => {
    expect(completionAction({ status: "scheduled", optimoCompletionStatus: "success" }, "failed", false)).toBe("leave");
    expect(completionAction({ status: "scheduled", optimoCompletionStatus: "success" }, null, false)).toBe("leave");
  });

  it("does not restore a day whose tiffins were moved, or a hold, or a void", () => {
    expect(completionAction(skipped, "success", true)).toBe("leave");
    expect(completionAction({ status: "paused", optimoCompletionStatus: null }, "success", false)).toBe("leave");
    expect(completionAction({ status: "cancelled", optimoCompletionStatus: null }, "failed", false)).toBe("leave");
  });
});

describe("leaveReason", () => {
  it("says why a row was left alone", () => {
    expect(leaveReason({ status: "scheduled", optimoCompletionStatus: "success" }, false)).toBe("Already confirmed delivered");
    expect(leaveReason({ status: "skipped", optimoCompletionStatus: "failed" }, false)).toBe("Already marked not delivered");
    expect(leaveReason({ status: "skipped", optimoCompletionStatus: null }, true)).toBe("Tiffins moved to another day");
    expect(leaveReason({ status: "paused", optimoCompletionStatus: null }, false)).toBe("Vacation — not revived from a route");
    expect(leaveReason({ status: "cancelled", optimoCompletionStatus: null }, false)).toBe("Cancelled — not revived from a route");
    expect(leaveReason({ status: "skipped", optimoCompletionStatus: null }, false)).toBe("On hold");
  });
});

describe("reportsUnmatched", () => {
  it("only a scheduled day missing from OptimoRoute is a gap", () => {
    expect(reportsUnmatched("scheduled")).toBe(true);
    expect(reportsUnmatched("skipped")).toBe(false);
    expect(reportsUnmatched("paused")).toBe(false);
    expect(reportsUnmatched("cancelled")).toBe(false);
  });
});

describe("phoneMatches", () => {
  const stop = (key: string, orderNo: string, phone = "416") => ({ key, orderNo, phone });

  it("matches one unclaimed stop to one unmatched row", () => {
    const m = phoneMatches([{ key: "D1", phone: "416" }], [stop("s1", "legacy")]);
    expect(m.get("D1")).toEqual({ kind: "match", stopKey: "s1" });
  });

  it("never borrows a stop already claimed by a sibling's orderNo", () => {
    const m = phoneMatches(
      [{ key: "D1", phone: "416" }, { key: "D2", phone: "416" }],
      [stop("s1", "D1")],
    );
    expect(m.has("D1")).toBe(false);
    expect(m.has("D2")).toBe(false);
  });

  it("is ambiguous when two of our unmatched rows share the phone", () => {
    const m = phoneMatches(
      [{ key: "D1", phone: "416" }, { key: "D2", phone: "416" }],
      [stop("s1", "legacy")],
    );
    expect(m.get("D1")).toEqual({ kind: "ambiguous", candidateCount: 1 });
    expect(m.get("D2")).toEqual({ kind: "ambiguous", candidateCount: 1 });
  });

  it("is ambiguous when two stops share the phone", () => {
    const m = phoneMatches([{ key: "D1", phone: "416" }], [stop("s1", "a"), stop("s2", "b")]);
    expect(m.get("D1")).toEqual({ kind: "ambiguous", candidateCount: 2 });
  });
});
