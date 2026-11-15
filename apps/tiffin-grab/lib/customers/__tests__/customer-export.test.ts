import { describe, expect, it } from "vitest";
import { customerExportRows } from "../customer-export";
import type { CustomerRow } from "@/lib/services/customers.service";

const row: CustomerRow = {
  publicId: "c1",
  name: "Ada",
  email: "ada@example.com",
  phone: "+16475550100",
  latestStatus: "active",
  latestOrderAt: null,
  totalPaid: "120.00",
  freeTiffins: 1,
  cancelledOrders: 0,
  lastDelivered: null,
  joined: true,
  lastInvite: null,
  lastReminder: null,
};

describe("customerExportRows", () => {
  it("includes Total paid only with finance:read", () => {
    const withFinance = customerExportRows([row], { canFinance: true, timezone: "UTC" });
    expect(withFinance.headers).toContain("Total paid");
    expect(withFinance.records[0]["Total paid"]).toBe(120);

    const without = customerExportRows([{ ...row, totalPaid: null }], { canFinance: false, timezone: "UTC" });
    expect(without.headers).not.toContain("Total paid");
    expect(Object.keys(without.records[0])).not.toContain("Total paid");
    expect(JSON.stringify(without)).not.toContain("120");
  });
});
