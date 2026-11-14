import { describe, expect, it } from "vitest";
import {
  CUSTOMER_EXPORT_COLUMNS,
  PLAN_EXPORT_COLUMNS,
  customerRowToExcelRecord,
  exportHeaders,
  parseExportColumns,
  planRowToExcelRecord,
} from "../export-columns";
import type { RenewalRow, RenewedCustomerRow } from "@/lib/renewals/renewals.service";

const plan: RenewalRow = {
  orderPublicId: "ord_1",
  customerPublicId: "cus_1",
  code: "TG-100",
  customerName: "Nia Renew",
  phone: "+16475550123",
  planName: "Weekly",
  mealSize: "Regular",
  lastTiffin: "2026-10-30",
  planTotal: "120.00",
  status: "none",
  trial: false,
  track: null,
  trackSource: null,
  lostReason: null,
  nextFollowUpAt: null,
  laterBookedAt: null,
  lastActivity: null,
  priorPlans: 2,
  holds: 1,
  openTickets: 0,
  walletCoins: 50,
  totalSpent: "400.00",
  prevOrderTotal: "110.00",
};

const customer: RenewedCustomerRow = {
  customerPublicId: "cus_1",
  customerName: "Nia Renew",
  phone: "+16475550123",
  plans: 3,
  renewals: 2,
  lastRenewedAt: Date.parse("2026-10-15T12:00:00Z"),
  currentMealSize: "Regular",
  currentLastTiffin: "2026-11-05",
  totalSpent: "400.00",
};

describe("parseExportColumns", () => {
  it("defaults to every plan column when empty", () => {
    expect(parseExportColumns(null, "renewals")).toEqual(PLAN_EXPORT_COLUMNS.map((c) => c.key));
    expect(parseExportColumns("", "renewals")).toEqual(PLAN_EXPORT_COLUMNS.map((c) => c.key));
  });

  it("keeps only known keys in request order", () => {
    expect(parseExportColumns("customer,bogus,phone,order", "renewals")).toEqual(["customer", "phone", "order"]);
  });

  it("defaults to every customer column on the customers tab", () => {
    expect(parseExportColumns(null, "customers")).toEqual(CUSTOMER_EXPORT_COLUMNS.map((c) => c.key));
  });
});

describe("planRowToExcelRecord", () => {
  it("maps only the requested columns with Excel headers", () => {
    const row = planRowToExcelRecord(plan, "2026-10-30", "America/Toronto", ["order", "renewal", "status", "totalSpent"]);
    expect(row).toEqual({ Order: "TG-100", Renewal: "Not renewed", Status: "New", "Total spent": 400 });
  });

  it("writes the staff track, lost reason, next follow-up and last activity in the app timezone", () => {
    const row = planRowToExcelRecord(
      {
        ...plan,
        track: "not_renewed",
        trackSource: "staff",
        lostReason: "price",
        nextFollowUpAt: null,
        lastActivity: { type: "call", note: "No answer", at: Date.parse("2026-10-31T15:00:00Z") },
      },
      "2026-10-30",
      "America/Toronto",
      ["status", "lostReason", "nextFollowUp", "lastActivity"],
    );
    expect(row).toEqual({ Status: "Not renewed", "Lost reason": "Price", "Next follow-up": "", "Last activity": "2026-10-31 No answer" });
  });

  it("labels a trial and a follow-up date", () => {
    const row = planRowToExcelRecord(
      { ...plan, trial: true, track: "follow_up", trackSource: "staff", nextFollowUpAt: Date.parse("2026-11-02T15:00:00Z") },
      "2026-10-30",
      "America/Toronto",
      ["type", "status", "nextFollowUp"],
    );
    expect(row).toEqual({ Type: "Trial", Status: "Follow up", "Next follow-up": "2026-11-02" });
  });
});

describe("customerRowToExcelRecord", () => {
  it("maps selected columns", () => {
    const row = customerRowToExcelRecord(customer, "America/Toronto", ["customer", "renewals", "spent"]);
    expect(row).toEqual({ Customer: "Nia Renew", Renewals: 2, Spent: 400 });
  });
});

describe("exportHeaders", () => {
  it("preserves selected order", () => {
    expect(exportHeaders("renewals", ["phone", "order"])).toEqual(["Phone", "Order"]);
  });
});
