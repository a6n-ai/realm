import { afterEach, describe, expect, it, vi } from "vitest";
import { dateTimeFormat } from "@foundry/commons/util/intl-format";
import { dayKey } from "@/lib/sessions/timezone";
import { formatSessionDay, formatSessionTime } from "@/lib/sessions/format";

describe("dateTimeFormat", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns one formatter per locale + options", () => {
    const a = dateTimeFormat("en-SG", { timeZone: "Asia/Singapore", hour: "numeric" });
    const b = dateTimeFormat("en-SG", { hour: "numeric", timeZone: "Asia/Singapore" });
    const c = dateTimeFormat("en-SG", { timeZone: "America/Toronto", hour: "numeric" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("session helpers stop building a formatter per call", () => {
    const at = new Date("2026-11-02T03:30:00Z");
    dayKey(at, "Asia/Singapore");
    formatSessionTime(at, "Asia/Singapore");
    formatSessionDay(at, "Asia/Singapore");
    const spy = vi.spyOn(Intl, "DateTimeFormat");
    for (let i = 0; i < 50; i++) {
      dayKey(at, "Asia/Singapore");
      formatSessionTime(at, "Asia/Singapore");
      formatSessionDay(at, "Asia/Singapore");
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("keeps the same output", () => {
    const at = new Date("2026-11-02T03:30:00Z");
    expect(dayKey(at, "Asia/Singapore")).toBe("2026-11-02");
    expect(formatSessionTime(at, "Asia/Singapore")).toBe(
      new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", hour: "numeric", minute: "2-digit", hour12: true }).format(at),
    );
  });
});
