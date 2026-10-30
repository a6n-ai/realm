import { describe, expect, it } from "vitest";
import { parseRenewalsFilter, renewalsQuery, type RenewalsFilter } from "../filters";

const base: RenewalsFilter = { tab: "renewals", dateBy: "last", ending: null, ended: null, status: null, renewed: null, from: null, to: null, q: "" };

describe("renewals filter", () => {
  it("has no window by default: the top date range (last tiffin) does the narrowing", () => {
    expect(parseRenewalsFilter({})).toEqual(base);
  });

  it("reads the tab, date type, range, windows, status and search, ignoring values off the menu", () => {
    expect(parseRenewalsFilter({ tab: "trials", dateBy: "running", from: "1", to: "2", ending: "2", ended: "30", status: "unpaid", q: "  asha   k " }))
      .toEqual({ tab: "trials", dateBy: "running", ending: 2, ended: 30, status: "unpaid", renewed: null, from: 1, to: 2, q: "asha k" });
    expect(parseRenewalsFilter({ ending: "5", ended: "8", status: "maybe", dateBy: "whenever" })).toEqual(base);
  });

  it("round-trips through the query string", () => {
    for (const f of [
      base,
      { ...base, tab: "trials", ending: 0 },
      { ...base, ended: 30, status: "lapsed", q: "ram" },
      { ...base, dateBy: "ordered", from: 1_790_000_000_000, to: 1_791_000_000_000 },
      { ...base, tab: "customers", renewed: 30 },
      { ...base, tab: "customers", from: 1, to: 2, q: "ram" },
    ] satisfies RenewalsFilter[]) {
      expect(parseRenewalsFilter(Object.fromEntries(new URLSearchParams(renewalsQuery(f))))).toEqual(f);
    }
  });
});
