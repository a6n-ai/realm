import { describe, expect, it } from "vitest";
import {
  SCHEDULE_MAX_AHEAD_MS,
  SCHEDULE_WINDOW_MESSAGE,
  scheduleWindowError,
} from "../schedule";

const NOW = Date.UTC(2026, 7, 11, 12, 0, 0);
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

describe("scheduleWindowError", () => {
  it("accepts a slot inside the window", () => {
    expect(scheduleWindowError(at(2 * 60 * 60 * 1000), NOW)).toBeNull();
  });

  it("accepts the far edge exactly", () => {
    expect(scheduleWindowError(at(SCHEDULE_MAX_AHEAD_MS), NOW)).toBeNull();
  });

  it("rejects a slot past the window", () => {
    expect(scheduleWindowError(at(SCHEDULE_MAX_AHEAD_MS + 60_000), NOW)).toBe(
      SCHEDULE_WINDOW_MESSAGE,
    );
  });

  it("rejects the past and the present", () => {
    expect(scheduleWindowError(at(-60_000), NOW)).toMatch(/future/);
    expect(scheduleWindowError(at(0), NOW)).toMatch(/future/);
  });

  it("rejects an unparseable date", () => {
    expect(scheduleWindowError("not a date", NOW)).toMatch(/future/);
  });
});
