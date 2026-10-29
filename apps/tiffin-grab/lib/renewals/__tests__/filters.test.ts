import { describe, expect, it } from "vitest";
import { missingWindow, parseRenewalsFilter, renewalsQuery, type RenewalsFilter } from "../filters";

const base: RenewalsFilter = { tab: "renewals", ending: 7, ended: null, status: null, renewed: null, q: "" };

describe("renewals filter", () => {
  it("defaults to plans ending within 7 days on the Renewals tab", () => {
    expect(parseRenewalsFilter({})).toEqual(base);
    expect(missingWindow({})).toBe(true);
    expect(missingWindow({ ended: "30" })).toBe(false);
    // The renewed-customers tab has no ending window.
    expect(missingWindow({ tab: "customers" })).toBe(false);
  });

  it("reads the tab, both windows, status and search, ignoring values off the menu", () => {
    expect(parseRenewalsFilter({ tab: "trials", ending: "2", ended: "30", status: "unpaid", q: "  asha   k " }))
      .toEqual({ tab: "trials", ending: 2, ended: 30, status: "unpaid", renewed: null, q: "asha k" });
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
      { ...base, ended: 30, status: "none", q: "ram" },
      { tab: "customers", ending: null, ended: null, status: null, renewed: 30, q: "" },
      { tab: "customers", ending: null, ended: null, status: null, renewed: null, q: "ram" },
    ] satisfies RenewalsFilter[]) {
      expect(parseRenewalsFilter(Object.fromEntries(new URLSearchParams(renewalsQuery(f))))).toEqual(f);
    }
  });
});
