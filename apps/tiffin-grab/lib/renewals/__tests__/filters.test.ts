import { describe, expect, it } from "vitest";
import { parseRenewalsFilter, renewalsQuery, type RenewalsFilter } from "../filters";

const base: RenewalsFilter = {
  tab: "renewals", type: null, track: null, followUp: null, dateBy: "last", ending: null, ended: null, status: null, renewed: null, from: null, to: null, q: "",
};

describe("renewals filter", () => {
  it("has no window by default: the top date range (last tiffin) does the narrowing", () => {
    expect(parseRenewalsFilter({})).toEqual(base);
  });

  it("reads the tab, date type, range, windows, status and search, ignoring values off the menu", () => {
    expect(parseRenewalsFilter({ tab: "renewals", dateBy: "running", from: "1", to: "2", ending: "2", ended: "30", status: "unpaid", q: "  asha   k " }))
      .toEqual({ ...base, dateBy: "running", ending: 2, ended: 30, status: "unpaid", from: 1, to: 2, q: "asha k" });
    expect(parseRenewalsFilter({ ending: "5", ended: "8", status: "maybe", dateBy: "whenever" })).toEqual(base);
  });

  it("maps the retired trials tab to the trial type on the plans list", () => {
    expect(parseRenewalsFilter({ tab: "trials" })).toEqual({ ...base, type: "trial" });
  });

  it("reads type, track csv and follow-up, dropping junk values", () => {
    expect(parseRenewalsFilter({ type: "regular", track: "new,follow_up,bogus,new", followUp: "overdue" }))
      .toEqual({ ...base, type: "regular", track: ["new", "follow_up"], followUp: "overdue" });
    expect(parseRenewalsFilter({ type: "both", track: "bogus", followUp: "soon" })).toEqual(base);
  });

  it("round-trips through the query string", () => {
    for (const f of [
      base,
      { ...base, type: "trial", ending: 0 },
      { ...base, type: "regular", track: ["new", "follow_up"], followUp: "due", owner: "me" },
      { ...base, ended: 30, status: "lapsed", q: "ram" },
      { ...base, dateBy: "ordered", from: 1_790_000_000_000, to: 1_791_000_000_000 },
      { ...base, tab: "customers", renewed: 30 },
      { ...base, tab: "customers", from: 1, to: 2, q: "ram" },
      { ...base, status: "booked_unpaid", from: 5, to: 9 },
    ] satisfies RenewalsFilter[]) {
      expect(parseRenewalsFilter(Object.fromEntries(new URLSearchParams(renewalsQuery(f))))).toEqual(f);
    }
  });

  it("carries the owner on plan tabs, never on customers", () => {
    const f = parseRenewalsFilter({ owner: "usr_1", ending: "3" });
    expect(f.owner).toBe("usr_1");
    expect(renewalsQuery(f)).toContain("owner=usr_1");
    expect(parseRenewalsFilter({ tab: "customers", owner: "usr_1" }).owner).toBeUndefined();
  });
});
