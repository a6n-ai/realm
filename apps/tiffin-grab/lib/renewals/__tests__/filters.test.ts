import { describe, expect, it } from "vitest";
import { parseRenewalsFilter, renewalsQuery } from "../filters";

describe("renewals filter", () => {
  it("defaults to plans ending within 7 days on the Renewals tab", () => {
    expect(parseRenewalsFilter({})).toEqual({ tab: "renewals", ending: 7, ended: null });
  });

  it("reads the tab and both windows, ignoring values off the menu", () => {
    expect(parseRenewalsFilter({ tab: "trials", ending: "2", ended: "30" })).toEqual({ tab: "trials", ending: 2, ended: 30 });
    expect(parseRenewalsFilter({ ending: "5" })).toEqual({ tab: "renewals", ending: 7, ended: null });
  });

  it("shows only lapsed plans when ending is off or only ended is set", () => {
    expect(parseRenewalsFilter({ ending: "off", ended: "14" })).toEqual({ tab: "renewals", ending: null, ended: 14 });
    expect(parseRenewalsFilter({ ended: "14" })).toEqual({ tab: "renewals", ending: null, ended: 14 });
  });

  it("never ends up with no window at all", () => {
    expect(parseRenewalsFilter({ ending: "off" })).toEqual({ tab: "renewals", ending: 7, ended: null });
  });

  it("round-trips through the query string", () => {
    for (const f of [
      { tab: "renewals", ending: 7, ended: null },
      { tab: "trials", ending: 0, ended: null },
      { tab: "renewals", ending: null, ended: 30 },
      { tab: "renewals", ending: 7, ended: 30 },
    ] as const) {
      expect(parseRenewalsFilter(Object.fromEntries(new URLSearchParams(renewalsQuery(f))))).toEqual(f);
    }
  });
});
