import { describe, expect, it } from "vitest";
import {
  CUSTOMER_EXPORT_COLUMNS,
  PLAN_EXPORT_COLUMNS,
  customerRowToExcelRecord,
  exportHeaders,
  parseExportColumns,
  planRowToExcelRecord,
} from "../renewal-export-columns";
import type { RenewalRow, RenewedCustomerRow } from "@/lib/services/renewals.service";

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
    expect(parseExportColumns("", "trials")).toEqual(PLAN_EXPORT_COLUMNS.map((c) => c.key));
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
    const row = planRowToExcelRecord(plan, "renewals", "2026-10-30", ["order", "status", "totalSpent"]);
    expect(row).toEqual({ Order: "TG-100", Status: "Not renewed", "Total spent": 400 });
  });

  it("uses trial labels on the trials tab", () => {
    const row = planRowToExcelRecord({ ...plan, status: "renewed" }, "trials", "2026-10-30", ["status"]);
    expect(row).toEqual({ Status: "Converted" });
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
