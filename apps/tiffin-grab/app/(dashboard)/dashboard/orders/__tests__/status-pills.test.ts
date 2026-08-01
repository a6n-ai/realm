import { describe, expect, it } from "vitest";
import { orderStatus } from "@/db/schema/orders";
import { ONGOING_STATUSES, ORDER_STATUS_PILLS, ongoingFilter } from "../status-pills";

describe("ongoingFilter", () => {
  it("passes other statuses through untouched", () => {
    const sp = { status: "cancelled", q: "raj" };
    expect(ongoingFilter(sp)).toEqual({ sp, extra: null });
  });

  it("strips the pseudo-status and returns the real set", () => {
    const { sp, extra } = ongoingFilter({ status: "ongoing", q: "raj" });
    expect(sp.status).toBeUndefined();
    expect(sp.q).toBe("raj");
    expect(extra).toEqual({
      type: "filter",
      field: "status",
      operator: "in",
      value: ["pending", "active", "paused"],
    });
  });
});

describe("status pills", () => {
  it("only 'ongoing' is a pseudo-value — every other pill is a real order status", () => {
    const real = new Set<string>(orderStatus.enumValues);
    const pseudo = ORDER_STATUS_PILLS.map((p) => p.value).filter((v) => !real.has(v));
    expect(pseudo).toEqual(["ongoing"]);
  });

  it("ONGOING_STATUSES are all real order statuses", () => {
    const real = new Set<string>(orderStatus.enumValues);
    expect(ONGOING_STATUSES.filter((s) => !real.has(s))).toEqual([]);
  });
});
