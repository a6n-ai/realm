import { describe, expect, it } from "vitest";
import { ValidationError } from "@foundry/commons";
import { addDayKey, fromZonedLocal, toZonedLocal, dayKey } from "../timezone";

describe("app timezone wall clock", () => {
  it("reads Singapore 10:00 as 02:00 UTC", () => {
    const date = fromZonedLocal("2026-10-01T10:00", "Asia/Singapore");
    expect(date.toISOString()).toBe("2026-10-01T02:00:00.000Z");
  });

  it("round-trips a zoned local string", () => {
    const zone = "Asia/Singapore";
    const date = fromZonedLocal("2026-09-16T19:00", zone);
    expect(toZonedLocal(date, zone)).toBe("2026-09-16T19:00");
  });

  it("keys a day in the app timezone, not UTC", () => {
    const late = fromZonedLocal("2026-09-16T23:30", "Asia/Singapore");
    expect(dayKey(late, "Asia/Singapore")).toBe("2026-09-16");
    expect(dayKey(late, "UTC")).toBe("2026-09-16");
  });

  it("rejects an empty local string", () => {
    expect(() => fromZonedLocal("", "Asia/Singapore")).toThrow(ValidationError);
  });

  it("adds calendar days on a YYYY-MM-DD key", () => {
    expect(addDayKey("2026-09-16", 1)).toBe("2026-09-17");
    expect(addDayKey("2026-09-30", 1)).toBe("2026-10-01");
  });
});
