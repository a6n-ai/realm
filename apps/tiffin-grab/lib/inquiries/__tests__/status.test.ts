import { describe, expect, it } from "vitest";
import { SUB_STATUSES, assertTransition, groupFor, isClosed, stageFor, statusLabel } from "../status";

describe("stageFor", () => {
  it("maps sub-statuses to stages", () => {
    expect(stageFor(null)).toBe("new");
    expect(stageFor("no_response")).toBe("new");
    expect(stageFor("responded")).toBe("contacted");
    for (const s of ["future", "persistent", "expected", "pending_payment"] as const) {
      expect(stageFor(s)).toBe("follow_up");
    }
    expect(stageFor("took_plan")).toBe("converted");
    expect(stageFor("took_trial")).toBe("converted");
    expect(stageFor("lost")).toBe("lost");
    expect(stageFor("undeliverable")).toBe("lost");
  });
});

describe("groupFor", () => {
  it("places null and closed-lead statuses in lead, responded in follow_up", () => {
    expect(groupFor(null)).toBe("lead");
    expect(groupFor("responded")).toBe("follow_up");
    expect(groupFor("lost")).toBe("lead");
  });
});

describe("labels and closure", () => {
  it("labels null as New and pending_payment as Pending payment", () => {
    expect(statusLabel(null)).toBe("New");
    expect(statusLabel("pending_payment")).toBe("Pending payment");
  });

  it("treats only lost and undeliverable as closed among lead statuses", () => {
    expect(isClosed("lost")).toBe(true);
    expect(isClosed("undeliverable")).toBe(true);
    expect(isClosed("persistent")).toBe(false);
    expect(isClosed(null)).toBe(false);
  });
});

describe("assertTransition", () => {
  it("allows moves between open statuses and closes", () => {
    expect(() => assertTransition("persistent", "lost")).not.toThrow();
    expect(() => assertTransition("persistent", "no_response")).not.toThrow();
    expect(() => assertTransition("expected", "expected")).not.toThrow();
  });

  it("allows reopening closed statuses to New only", () => {
    expect(() => assertTransition("lost", null)).not.toThrow();
    expect(() => assertTransition("undeliverable", null)).not.toThrow();
    expect(() => assertTransition("lost", "expected")).toThrow();
  });

  it("never moves a closed-to-plan status elsewhere", () => {
    expect(() => assertTransition("took_plan", "lost")).toThrow();
  });

  it("only allows conversion statuses from the convert path", () => {
    for (const from of [null, ...SUB_STATUSES] as const) {
      expect(() => assertTransition(from, "took_plan")).toThrow();
    }
  });
});
