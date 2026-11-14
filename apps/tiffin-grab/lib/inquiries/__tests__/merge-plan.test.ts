import { describe, expect, it } from "vitest";
import { fillPlan, groupInquiries, pickWinner, type MergeRow } from "../merge-plan";

let id = 0n;
const r = (o: Partial<MergeRow>): MergeRow => ({
  id: ++id, publicId: `inq_${id}`, stage: "new", phone: null, whatsappPhone: null, email: null, latestActivityAt: 0, createdAt: Number(id), ...o,
});

describe("groupInquiries", () => {
  it("groups transitively across phone and email", () => {
    const a = r({ phone: "+16475550001" });
    const b = r({ email: "x@y.co" });
    const c = r({ phone: "+16475550001", email: "X@y.co" });
    const lone = r({ phone: "+16475550099" });
    const groups = groupInquiries([a, b, c, lone]);
    expect(groups).toHaveLength(1);
    expect(groups[0].map((g) => g.id).sort()).toEqual([a.id, b.id, c.id].sort());
  });

  it("matches a phone against another row's WhatsApp number", () => {
    const a = r({ phone: "+16475550002" });
    const b = r({ phone: "+16475550003", whatsappPhone: "+16475550002" });
    expect(groupInquiries([a, b])).toHaveLength(1);
  });
});

describe("pickWinner", () => {
  it("open beats a newer converted row", () => {
    const open = r({ stage: "new", latestActivityAt: 1 });
    const conv = r({ stage: "converted", latestActivityAt: 99 });
    expect(pickWinner([conv, open]).id).toBe(open.id);
  });

  it("quoted ranks like contacted, and a tie goes to the latest activity", () => {
    const quoted = r({ stage: "quoted", latestActivityAt: 5 });
    const contacted = r({ stage: "contacted", latestActivityAt: 9 });
    expect(pickWinner([quoted, contacted]).id).toBe(contacted.id);
  });
});

describe("fillPlan", () => {
  it("never overwrites, takes the newest loser first, and skips held identifiers", () => {
    const winner = r({ phone: "+16475550004", postalCode: null, email: null } as Partial<MergeRow>);
    const older = r({ postalCode: "M5V 2T6", latestActivityAt: 1 } as Partial<MergeRow>);
    const newer = r({ postalCode: "M4C 1A1", email: "held@x.co", latestActivityAt: 9 } as Partial<MergeRow>);
    const plan = fillPlan(winner, [older, newer], new Set(["held@x.co"]));
    expect(plan).toEqual({ postalCode: "M4C 1A1" });
  });
});
