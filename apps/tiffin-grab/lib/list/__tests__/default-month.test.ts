import { describe, expect, it, vi } from "vitest";

// withListDates reads the business timezone from app settings; the unit job has no database.
vi.mock("@/lib/settings", () => ({ getAppSettings: async () => ({ timezone: "America/Toronto" }) }));
import { explicitDates, fillDefaultMonth, withListDates } from "@/lib/list/default-month";
import type { WithUrlDates } from "@/lib/dates/range-params";
import { isoDateInZone } from "@foundry/commons/util/dates";

const TZ = "America/Toronto";
const now = Date.parse("2035-03-10T16:00:00Z");

const WINDOW = { from: "1761969600000", to: "1764565199999" };

describe("fillDefaultMonth", () => {
  it("fills a missing range with the current business month and writes no URL dates", () => {
    const sp = fillDefaultMonth({} as { from?: string; to?: string }, TZ, now);
    expect(isoDateInZone(Number(sp.from), TZ)).toBe("2035-03-01");
    expect(isoDateInZone(Number(sp.to), TZ)).toBe("2035-03-31");
    expect((sp as WithUrlDates).dateQs).toBe("");
  });

  it("keeps a legacy epoch window and rewrites it as ISO dates", () => {
    expect(fillDefaultMonth({ ...WINDOW }, TZ, now)).toEqual({
      ...WINDOW,
      dateQs: "from=2025-11-01&to=2025-11-30",
    });
  });

  it("reads ISO dates as the same epoch window", () => {
    const sp = fillDefaultMonth({ from: "2025-11-01", to: "2025-11-30" }, TZ, now);
    expect({ from: sp.from, to: sp.to }).toEqual(WINDOW);
  });

  it("reads range=last-7 relative to now", () => {
    const sp = fillDefaultMonth({ range: "last-7" } as { from?: string; to?: string; range?: string }, TZ, now);
    expect(isoDateInZone(Number(sp.from), TZ)).toBe("2035-03-04");
    expect(isoDateInZone(Number(sp.to), TZ)).toBe("2035-03-10");
    expect((sp as WithUrlDates).dateQs).toBe("range=last-7");
  });

  it("frozen windows stay frozen in drill links; relative ones stay relative", () => {
    const last7 = fillDefaultMonth({ from: "2035-03-04", to: "2035-03-10" }, TZ, now) as WithUrlDates;
    expect(last7.dateQs).toBe("from=2035-03-04&to=2035-03-10");
    expect((fillDefaultMonth({ range: "last-7" } as { from?: string; to?: string; range?: string }, TZ, now) as WithUrlDates).dateQs).toBe("range=last-7");
    const month = fillDefaultMonth({ from: "2035-03-01", to: "2035-03-31" }, TZ, now) as WithUrlDates;
    expect(month.dateQs).toBe("from=2035-03-01&to=2035-03-31");
    expect((fillDefaultMonth({}, TZ, now) as WithUrlDates).dateQs).toBe("");
  });

  it("hostile epoch falls back to the default month without throwing", () => {
    const sp = fillDefaultMonth({ from: "9".repeat(400), to: "1".repeat(17) }, TZ, now);
    expect(isoDateInZone(Number(sp.from), TZ)).toBe("2035-03-01");
  });

  it("a 15 or 16 digit epoch past year 9999 falls back without throwing", () => {
    for (const v of ["253402300800000", "8640000000000000"]) {
      const sp = fillDefaultMonth({ from: v }, TZ, now);
      expect(isoDateInZone(Number(sp.from), TZ)).toBe("2035-03-01");
    }
  });

  it("garbage falls back to the default month", () => {
    const sp = fillDefaultMonth({ from: "nope", to: "2035-99-99" }, TZ, now);
    expect(isoDateInZone(Number(sp.from), TZ)).toBe("2035-03-01");
  });
});

describe("explicitDates", () => {
  it("turns range= and ISO into epoch strings and leaves no window alone", () => {
    const iso = explicitDates({ from: "2035-03-04", to: "2035-03-10", page: "1" }, TZ, now);
    expect(isoDateInZone(Number(iso.from), TZ)).toBe("2035-03-04");
    expect(isoDateInZone(Number(iso.to), TZ)).toBe("2035-03-10");
    expect(iso.page).toBe("1");
    const rel = explicitDates({ range: "last-7" } as { from?: string; to?: string; range?: string }, TZ, now);
    expect(isoDateInZone(Number(rel.from), TZ)).toBe("2035-03-04");
    expect(explicitDates({ from: "9".repeat(400) }, TZ, now)).toEqual({ from: undefined, to: undefined });
    expect(explicitDates({}, TZ, now)).toEqual({ from: undefined, to: undefined });
  });
});

describe("withListDates", () => {
  it("drops the date range while a text search is active", async () => {
    expect(await withListDates({ q: " tomar ", ...WINDOW, page: "2" })).toEqual({
      q: " tomar ",
      from: undefined,
      to: undefined,
      dateQs: undefined,
      page: "2",
    });
  });

  it("reads ISO and range= into the epoch window the inquiries page hands parseFilterState", async () => {
    const iso = await withListDates({ from: "2035-03-04", to: "2035-03-10" });
    expect(isoDateInZone(Number(iso.from), "America/Toronto")).toBe("2035-03-04");
    const rel = await withListDates({ range: "last-7" } as { from?: string; to?: string; range?: string });
    expect(Number(rel.to) - Number(rel.from)).toBeGreaterThan(6 * 86_400_000);
    const dflt = await withListDates({} as { from?: string; to?: string });
    expect(Number(dflt.from)).toBeGreaterThan(0);
  });

  it("keeps an explicit range when the search box is empty", async () => {
    const sp = await withListDates({ q: "  ", ...WINDOW });
    expect({ from: sp.from, to: sp.to }).toEqual(WINDOW);
  });
});
