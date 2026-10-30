import { describe, expect, it } from "vitest";
import { ENDING_OFF, missingWindow, parseRenewalsFilter, renewalsQuery, type RenewalsFilter } from "../filters";

const base: RenewalsFilter = { tab: "renewals", ending: 7, ended: null, status: null, renewed: null, from: null, to: null, q: "" };
const cleared: RenewalsFilter = { ...base, ending: null };

describe("renewals filter", () => {
  it("defaults to plans ending within 7 days on the Renewals tab", () => {
    expect(parseRenewalsFilter({})).toEqual(base);
    expect(missingWindow({})).toBe(true);
    expect(missingWindow({ ended: "30" })).toBe(false);
    // The renewed-customers tab has no ending window.
    expect(missingWindow({ tab: "customers" })).toBe(false);
    // The order-date range narrows the window, it does not replace it.
    expect(parseRenewalsFilter({ from: "1", to: "2", ending: "3" })).toEqual({ ...base, ending: 3, from: 1, to: 2 });
  });

  it("keeps Ending within cleared when ending=off so Ended / Status can stand alone", () => {
    expect(missingWindow({ ending: ENDING_OFF })).toBe(false);
    expect(parseRenewalsFilter({ ending: ENDING_OFF })).toEqual(cleared);
    expect(parseRenewalsFilter({ ending: ENDING_OFF, ended: "30" })).toEqual({ ...cleared, ended: 30 });
    expect(parseRenewalsFilter({ ending: ENDING_OFF, status: "lapsed" })).toEqual({ ...cleared, status: "lapsed" });
  });

  it("reads the tab, both windows, status and search, ignoring values off the menu", () => {
    expect(parseRenewalsFilter({ tab: "trials", ending: "2", ended: "30", status: "unpaid", q: "  asha   k " }))
      .toEqual({ tab: "trials", ending: 2, ended: 30, status: "unpaid", renewed: null, from: null, to: null, q: "asha k" });
    expect(parseRenewalsFilter({ ending: "5", status: "maybe" })).toEqual(base);
  });

  it("shows only lapsed plans when only ended is set", () => {
    expect(parseRenewalsFilter({ ended: "14" })).toEqual({ ...base, ending: null, ended: 14 });
  });

  it("round-trips through the query string", () => {
    for (const f of [
      base,
      { ...base, tab: "trials", ending: 0 },
      { ...base, ending: null, ended: 30 },
      { ...base, ended: 30, status: "lapsed", q: "ram" },
      { tab: "customers", ending: null, ended: null, status: null, renewed: 30, from: null, to: null, q: "" },
      { tab: "customers", ending: null, ended: null, status: null, renewed: null, from: 1, to: 2, q: "ram" },
      { ...base, from: 1_790_000_000_000, to: 1_791_000_000_000 },
    ] satisfies RenewalsFilter[]) {
      expect(parseRenewalsFilter(Object.fromEntries(new URLSearchParams(renewalsQuery(f))))).toEqual(f);
    }
  });
});
