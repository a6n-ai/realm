import { describe, it, expect } from "vitest";
import { pickAssignee, strategyFor, type PoolMember, type LeadAssignmentConfig } from "../assignment";

const pool: PoolMember[] = [{ id: 1n, publicId: "a" }, { id: 2n, publicId: "b" }, { id: 3n, publicId: "c" }];
const base: LeadAssignmentConfig = { strategy: "round_robin", perSource: {}, weights: {}, cursor: {} };

describe("strategyFor", () => {
  it("uses per-source override when present", () => {
    expect(strategyFor({ ...base, strategy: "creator", perSource: { facebook: "round_robin" } }, "facebook")).toBe("round_robin");
  });
  it("falls back to global", () => {
    expect(strategyFor(base, "google")).toBe("round_robin");
  });
});

describe("round_robin", () => {
  it("starts at the first member when no cursor", () => {
    const r = pickAssignee("round_robin", pool, base, "google", 0);
    expect(r.chosen?.publicId).toBe("a");
    expect(r.cursorPublicId).toBe("a");
  });
  it("advances past the cursor", () => {
    const r = pickAssignee("round_robin", pool, { ...base, cursor: { google: "a" } }, "google", 0);
    expect(r.chosen?.publicId).toBe("b");
  });
  it("wraps around", () => {
    const r = pickAssignee("round_robin", pool, { ...base, cursor: { google: "c" } }, "google", 0);
    expect(r.chosen?.publicId).toBe("a");
  });
});

describe("percentage", () => {
  it("weights selection by configured weight (roll lands in b's band)", () => {
    const cfg: LeadAssignmentConfig = { ...base, strategy: "percentage", weights: { a: 1, b: 3 } };
    // a band [0,0.25), b band [0.25,1). roll 0.5 -> b
    expect(pickAssignee("percentage", pool, cfg, "x", 0.5).chosen?.publicId).toBe("b");
    expect(pickAssignee("percentage", pool, cfg, "x", 0.1).chosen?.publicId).toBe("a");
  });
});

describe("empty pool", () => {
  it("returns null chosen", () => {
    expect(pickAssignee("round_robin", [], base, "x", 0).chosen).toBeNull();
  });
});
