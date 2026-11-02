import { afterEach, describe, expect, it, vi } from "vitest";
import { dateTimeFormat } from "./date-format";
import { formatDateOnly, formatEpoch } from "@/lib/format/datetime";

describe("dateTimeFormat", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns one formatter per locale + options", () => {
    const a = dateTimeFormat("en-US", { timeZone: "America/Toronto", hour: "numeric" });
    const b = dateTimeFormat("en-US", { hour: "numeric", timeZone: "America/Toronto" });
    const c = dateTimeFormat("en-US", { timeZone: "Asia/Kolkata", hour: "numeric" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("format helpers stop building a formatter per call", () => {
    const at = Date.parse("2026-11-02T03:30:00Z");
    formatEpoch(at, { timeZone: "America/Toronto" });
    formatDateOnly("2026-11-02");
    const spy = vi.spyOn(Intl, "DateTimeFormat");
    for (let i = 0; i < 50; i++) {
      formatEpoch(at, { timeZone: "America/Toronto" });
      formatDateOnly("2026-11-02");
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("keeps the same output", () => {
    const at = Date.parse("2026-11-02T03:30:00Z");
    expect(formatEpoch(at, { mode: "time", timeZone: "America/Toronto" })).toBe(
      new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Toronto" }).format(at),
    );
  });
});
