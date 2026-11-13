import { describe, expect, it } from "vitest";
import { orderStatus } from "@/db/schema/orders";
import {
  BOOKED_STATUSES,
  ONGOING_STATUSES,
  ORDER_STATUS_PILLS,
  RUNNING_STATUSES,
  SOON_STATUSES,
  orderStatusFilter,
} from "@/lib/orders/status-pills";

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
    expect(orderStatusFilter({ status: "running" }).extra).toMatchObject({ value: [...RUNNING_STATUSES] });
    expect(orderStatusFilter({ status: "soon" }).extra).toMatchObject({ value: [...SOON_STATUSES] });
    expect(orderStatusFilter({ status: "booked" }).extra).toMatchObject({ value: [...BOOKED_STATUSES] });
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
    for (const set of [ONGOING_STATUSES, RUNNING_STATUSES, SOON_STATUSES, BOOKED_STATUSES]) {
      expect(set.filter((s) => !real.has(s))).toEqual([]);
    }
  });
});
