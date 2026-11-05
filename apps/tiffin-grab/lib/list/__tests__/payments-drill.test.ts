import { describe, expect, it } from "vitest";
import { paymentsListHref } from "../payments-drill";

describe("paymentsListHref", () => {
  it("targets the tab path with status and dates", () => {
    expect(paymentsListHref("requests", { from: "1", to: "2" }, { status: "paid" })).toBe(
      "/dashboard/payments/requests?from=1&to=2&status=paid",
    );
  });

  it("carries stripe attention facets", () => {
    expect(
      paymentsListHref("stripe", { from: "1", to: "2" }, { attention: "stuck,failed" }),
    ).toContain("attention=stuck%2Cfailed");
  });

  it("carries ledger type", () => {
    expect(paymentsListHref("ledger", { from: "1", to: "2" }, { type: "refund" })).toBe(
      "/dashboard/payments/ledger?from=1&to=2&type=refund",
    );
  });
});
