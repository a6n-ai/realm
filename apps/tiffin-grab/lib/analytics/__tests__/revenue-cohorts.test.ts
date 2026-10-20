import { describe, expect, it } from "vitest";
import { cohortForOrder, summarizeRevenueCohorts, type CohortPaymentRow } from "../revenue-cohorts";

const TZ = "America/Toronto";
const AT = Date.parse("2035-03-10T17:00:00Z");

function pay(over: Partial<CohortPaymentRow> = {}): CohortPaymentRow {
  return {
    orderId: "1",
    status: "paid",
    method: "etransfer",
    amount: 169.5,
    at: AT,
    orderTotal: 169.5,
    snapshot: {
      subtotal: 200,
      taxTotal: 19.5,
      total: 169.5,
      adjustments: [],
    },
    trialLength: null,
    userId: "u1",
    orderCreatedAt: AT - 1000,
    hasPriorNonTrial: false,
    ...over,
  };
}

describe("cohortForOrder", () => {
  it("labels trials by trialLength", () => {
    expect(cohortForOrder({ trialLength: 3, hasPriorNonTrial: true })).toBe("trials");
  });

  it("labels renewals when a prior non-trial exists", () => {
    expect(cohortForOrder({ trialLength: null, hasPriorNonTrial: true })).toBe("renewals");
  });

  it("labels first non-trial as new", () => {
    expect(cohortForOrder({ trialLength: null, hasPriorNonTrial: false })).toBe("new");
  });
});

describe("summarizeRevenueCohorts", () => {
  it("splits net sales by cohort and counts distinct orders", () => {
    const { slices, totalAmount } = summarizeRevenueCohorts({
      from: "2035-03-01",
      to: "2035-03-31",
      timezone: TZ,
      payments: [
        pay({ orderId: "t1", trialLength: 2, amount: 56.5, orderTotal: 56.5, snapshot: { subtotal: 50, taxTotal: 6.5, total: 56.5 } }),
        pay({ orderId: "n1", hasPriorNonTrial: false }),
        pay({
          orderId: "r1",
          hasPriorNonTrial: true,
          amount: 113,
          orderTotal: 113,
          snapshot: { subtotal: 100, taxTotal: 13, total: 113 },
        }),
        // Second payment on the same new plan — amount grows, count stays 1.
        pay({
          orderId: "n1",
          hasPriorNonTrial: false,
          amount: 56.5,
          orderTotal: 226,
          snapshot: { subtotal: 200, taxTotal: 26, total: 226 },
        }),
      ],
    });

    const by = Object.fromEntries(slices.map((s) => [s.key, s]));
    expect(by.trials?.count).toBe(1);
    expect(by.trials?.amount).toBe(50);
    expect(by.new?.count).toBe(1);
    // First payment net 150 + second payment net 50 (tax share 6.5 on $56.50).
    expect(by.new?.amount).toBe(200);
    expect(by.renewals?.count).toBe(1);
    expect(by.renewals?.amount).toBe(100);
    expect(totalAmount).toBe(350);
  });

  it("ignores refunded payments", () => {
    const { totalAmount, totalCount } = summarizeRevenueCohorts({
      from: "2035-03-01",
      to: "2035-03-31",
      timezone: TZ,
      payments: [pay({ status: "refunded" })],
    });
    expect(totalAmount).toBe(0);
    expect(totalCount).toBe(0);
  });
});
