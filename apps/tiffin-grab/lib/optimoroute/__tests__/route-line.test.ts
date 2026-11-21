import { describe, expect, it } from "vitest";
import { nextPushLine, routeLine, type RouteLineInput } from "../route-line";

const tz = "America/Toronto";
const base: RouteLineInput = {
  installed: true,
  hasApiKey: true,
  canDispatch: true,
  canSettings: false,
  tz,
  counts: { total: 10, sent: 10, routed: 0, done: 0, lastSentAt: Date.parse("2026-11-20T14:12:00Z") },
  now: Date.parse("2026-11-20T18:00:00Z"),
};

describe("routeLine", () => {
  it("sent: ok tone with the time in the business tz", () => {
    expect(routeLine(base)).toMatchObject({ label: "Sent 9:12 am", tone: "ok", href: "/dashboard/dispatch" });
  });

  it("sent the evening before: says yesterday, older sends show the date", () => {
    const evening = { ...base, counts: { ...base.counts!, lastSentAt: Date.parse("2026-11-20T01:30:00Z") } };
    expect(routeLine(evening)?.label).toBe("Sent yesterday 8:30 pm");
    const older = { ...base, counts: { ...base.counts!, lastSentAt: Date.parse("2026-11-17T15:00:00Z") } };
    expect(routeLine(older)?.label).toBe("Sent Nov 17, 10:00 am");
  });

  it("partly sent: warn with the count", () => {
    const r = routeLine({ ...base, counts: { ...base.counts!, sent: 4 } });
    expect(r).toMatchObject({ label: "Sent 4/10", tone: "warn" });
  });

  it("nothing sent: warn", () => {
    const r = routeLine({ ...base, counts: { ...base.counts!, sent: 0, lastSentAt: null } });
    expect(r).toMatchObject({ label: "Not sent yet", tone: "warn" });
  });

  it("routes pulled: ok, and the hint lists the three steps", () => {
    const r = routeLine({ ...base, counts: { ...base.counts!, routed: 10, done: 3 } });
    expect(r).toMatchObject({ label: "Routes pulled", tone: "ok" });
    expect(r?.hint).toBe("Sent 10/10 · Routes pulled 10/10 · Delivered 3/10");
  });

  it("no stops today: no line", () => {
    expect(routeLine({ ...base, counts: { total: 0, sent: 0, routed: 0, done: 0, lastSentAt: null } })).toBeNull();
  });

  it("installed without an API key: muted Not connected", () => {
    expect(routeLine({ ...base, hasApiKey: false })).toMatchObject({ label: "Not connected", tone: "muted", href: "/dashboard/dispatch" });
  });

  it("not installed: nothing unless the viewer can manage settings", () => {
    expect(routeLine({ ...base, installed: false })).toBeNull();
    expect(routeLine({ ...base, installed: false, canSettings: true })).toMatchObject({
      label: "Not connected",
      tone: "muted",
      href: "/dashboard/settings/optimoroute",
    });
  });

  it("no dispatch permission: nothing", () => {
    expect(routeLine({ ...base, canDispatch: false })).toBeNull();
  });
});

describe("nextPushLine", () => {
  it("names the next day and how much of it is on OptimoRoute", () => {
    expect(nextPushLine({ date: "2026-11-23", total: 10, pushed: 0 })).toMatchObject({ tone: "warn" });
    expect(nextPushLine({ date: "2026-11-23", total: 10, pushed: 0 }).label).toMatch(/not pushed$/);
    expect(nextPushLine({ date: "2026-11-23", total: 10, pushed: 4 }).label).toMatch(/pushed 4\/10$/);
    expect(nextPushLine({ date: "2026-11-23", total: 10, pushed: 10 })).toMatchObject({ tone: "ok", href: "/dashboard/dispatch" });
  });
});
