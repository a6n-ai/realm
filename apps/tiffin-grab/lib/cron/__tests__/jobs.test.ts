import { describe, expect, it } from "vitest";
import { describeCron, nextCronRun } from "../jobs";

const at = (iso: string) => Date.parse(iso);
const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());

describe("nextCronRun", () => {
  it("daily: later today, or tomorrow once the time has passed", () => {
    expect(iso(nextCronRun("0 2 * * *", at("2026-10-03T01:30:00Z")))).toBe("2026-10-03T02:00:00.000Z");
    expect(iso(nextCronRun("0 2 * * *", at("2026-10-03T02:00:00Z")))).toBe("2026-10-04T02:00:00.000Z");
  });
  it("hourly: the next :00", () => {
    expect(iso(nextCronRun("0 * * * *", at("2026-10-03T07:15:00Z")))).toBe("2026-10-03T08:00:00.000Z");
  });
  it("returns null for shapes it doesn't handle", () => {
    expect(nextCronRun("*/5 * * * *", at("2026-10-03T07:15:00Z"))).toBeNull();
  });
});

describe("describeCron", () => {
  it("shows the daily time in the app timezone", () => {
    expect(describeCron("0 2 * * *", "America/Toronto", at("2026-10-03T07:00:00Z"))).toBe("Daily 10:00 PM");
    expect(describeCron(null, "America/Toronto", 0)).toBe("Not scheduled");
  });
});
