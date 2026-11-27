import { describe, expect, test } from "vitest";
import { CLOSED_STAGES, OPEN_STAGES, reopen, STAGES, transition, ValidationError } from "../stages";

const reasonFor = (to: string) => (to === "lost" ? { lostReason: "budget" } : {});

describe("transition", () => {
  test("every open stage moves to every other stage", () => {
    for (const from of OPEN_STAGES) {
      for (const to of STAGES.filter((s) => s !== from)) {
        const { patch, activity } = transition(from, to, { ...reasonFor(to), now: 5 });
        expect(patch.stage).toBe(to);
        expect(activity).toEqual({ type: "stage_change", fromStage: from, toStage: to });
      }
    }
  });

  test("moving to the same stage is refused", () => {
    expect(() => transition("new", "new")).toThrow(ValidationError);
  });

  test("unknown stages are refused", () => {
    expect(() => transition("new", "nope")).toThrow(ValidationError);
  });

  test("won and lost close the inquiry and clear the follow-up", () => {
    expect(transition("new", "won", { now: 9 }).patch).toEqual({ stage: "won", lostReason: null, closedAt: 9, nextFollowUpAt: null });
    expect(transition("new", "lost", { lostReason: "timing", now: 9 }).patch).toEqual({
      stage: "lost",
      lostReason: "timing",
      closedAt: 9,
      nextFollowUpAt: null,
    });
  });

  test("moving between open stages leaves closedAt and the follow-up alone", () => {
    expect(transition("new", "contacted").patch).toEqual({ stage: "contacted", lostReason: null });
  });

  test("lost without a valid reason is refused", () => {
    expect(() => transition("new", "lost")).toThrow(ValidationError);
    expect(() => transition("new", "lost", { lostReason: "bored" })).toThrow(ValidationError);
  });

  test("a closed inquiry cannot change except by reopen", () => {
    for (const from of CLOSED_STAGES) {
      for (const to of STAGES) expect(() => transition(from, to, reasonFor(to))).toThrow(ValidationError);
    }
  });
});

describe("reopen", () => {
  test("clears closedAt, sets the follow-up and logs reopened", () => {
    expect(reopen("lost", "contacted", 100)).toEqual({
      patch: { stage: "contacted", closedAt: null, nextFollowUpAt: 100 },
      activity: { type: "reopened", fromStage: "lost", toStage: "contacted" },
    });
  });

  test("needs a follow-up date", () => {
    expect(() => reopen("won", "new", null)).toThrow(ValidationError);
    expect(() => reopen("won", "new", undefined)).toThrow(ValidationError);
  });

  test("accepts only open target stages", () => {
    expect(() => reopen("won", "lost", 1)).toThrow(ValidationError);
    expect(() => reopen("won", "won", 1)).toThrow(ValidationError);
    for (const s of OPEN_STAGES) expect(reopen("won", s, 1).patch.stage).toBe(s);
  });

  test("only a closed inquiry can be reopened", () => {
    expect(() => reopen("new", "contacted", 1)).toThrow(ValidationError);
  });
});
