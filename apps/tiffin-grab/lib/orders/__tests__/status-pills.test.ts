import { describe, expect, it } from "vitest";
import { orderStatus } from "@/db/schema/orders";
import { BOOKED, ONGOING, RUNNING, STARTING_SOON } from "@/lib/orders/status";
import { ORDER_STATUS_PILLS, orderStatusFilter } from "@/lib/orders/status-pills";

describe("orderStatusFilter", () => {
  it("passes other statuses through untouched", () => {
    const sp = { status: "cancelled", q: "raj" };
    expect(orderStatusFilter(sp)).toEqual({ sp, extra: null });
  });

  it("strips ongoing and returns the real set", () => {
    const { sp, extra } = orderStatusFilter({ status: "ongoing", q: "raj" });
    expect(sp.status).toBeUndefined();
    expect(sp.q).toBe("raj");
    expect(extra).toEqual({
      type: "filter",
      field: "status",
      operator: "in",
      value: ["pending", "active", "paused"],
    });
  });

  it("expands running / soon / booked for KPI drills", () => {
    expect(orderStatusFilter({ status: "running" }).extra).toMatchObject({ value: [...RUNNING] });
    expect(orderStatusFilter({ status: "soon" }).extra).toMatchObject({ value: [...STARTING_SOON] });
    expect(orderStatusFilter({ status: "booked" }).extra).toMatchObject({ value: [...BOOKED] });
  });
});

describe("status pills", () => {
  it("pseudo-values are the KPI buckets; every other pill is a real order status", () => {
    const real = new Set<string>(orderStatus.enumValues);
    const pseudo = ORDER_STATUS_PILLS.map((p) => p.value).filter((v) => !real.has(v));
    expect(pseudo).toEqual(["ongoing", "running", "booked"]);
  });

  it("pseudo status sets are all real order statuses", () => {
    const real = new Set<string>(orderStatus.enumValues);
    for (const set of [ONGOING, RUNNING, STARTING_SOON, BOOKED]) {
      expect(set.filter((s) => !real.has(s))).toEqual([]);
    }
  });
});
