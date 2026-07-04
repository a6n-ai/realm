import { describe, it, expect } from "vitest";
import { pickAssignee, strategyFor, type PoolMember, type LeadAssignmentConfig } from "../assignment";

const pool: PoolMember[] = [{ id: 1n, publicId: "a", weight: 1 }, { id: 2n, publicId: "b", weight: 1 }, { id: 3n, publicId: "c", weight: 1 }];
const base: LeadAssignmentConfig = { strategy: "round_robin", perSource: {}, cursor: {} };

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
  const wpool: PoolMember[] = [{ id: 1n, publicId: "a", weight: 1 }, { id: 2n, publicId: "b", weight: 3 }, { id: 3n, publicId: "c", weight: 1 }];
  it("weights selection by member weight", () => {
    expect(pickAssignee("percentage", wpool, base, "x", 0.5).chosen?.publicId).toBe("b"); // b band [0.2,1)
    expect(pickAssignee("percentage", wpool, base, "x", 0.1).chosen?.publicId).toBe("a");
  });
});

describe("empty pool", () => {
  it("returns null chosen", () => {
    expect(pickAssignee("round_robin", [], base, "x", 0).chosen).toBeNull();
  });
});
