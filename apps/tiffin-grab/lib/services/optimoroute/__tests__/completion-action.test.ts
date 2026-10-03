import { describe, expect, it } from "vitest";
import { completionAction } from "../completions";

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
