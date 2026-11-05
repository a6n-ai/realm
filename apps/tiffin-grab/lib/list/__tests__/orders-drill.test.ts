import { describe, expect, it } from "vitest";
import { ordersListHref } from "../orders-drill";

describe("ordersListHref", () => {
  it("preserves dates for booked (new orders) drills", () => {
    expect(ordersListHref({ from: "10", to: "20" }, { status: "booked" })).toBe(
      "/dashboard/orders?from=10&to=20&status=booked",
    );
  });

  it("clears dates for running and starting-soon", () => {
    expect(ordersListHref({ from: "10", to: "20" }, { status: "running", clearDates: true })).toBe(
      "/dashboard/orders?status=running",
    );
    expect(
      ordersListHref({ from: "10", to: "20" }, { status: "soon", starts: "7", clearDates: true }),
    ).toBe("/dashboard/orders?status=soon&starts=7");
  });

  it("dates cancel activity via cancelledAt", () => {
    expect(ordersListHref({ from: "10", to: "20" }, { cancelledAt: true })).toBe(
      "/dashboard/orders?cancelledAt=1&from=10&to=20",
    );
  });

  it("marks an all-time active-plans drill so the default month is not filled back in", () => {
    expect(ordersListHref({}, { status: "active", clearDates: true, datesAll: true })).toBe(
      "/dashboard/orders?status=active&dates=all",
    );
  });

  it("carries work-queue views", () => {
    expect(ordersListHref({}, { view: "lookout", status: "running", clearDates: true })).toBe(
      "/dashboard/orders?view=lookout&status=running",
    );
  });
});
