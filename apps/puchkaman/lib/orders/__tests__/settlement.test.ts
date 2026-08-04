import { describe, expect, it } from "vitest";
import { resolveSettlement } from "../settlement";

describe("resolveSettlement", () => {
  it("settles clean when Clover charged the quoted total", () => {
    expect(resolveSettlement(11.29, 1129)).toEqual({
      mismatch: false,
      settledTotal: 11.29,
      deltaCents: 0,
      paymentStatus: "paid",
      adjustmentDirection: null,
    });
  });

  // Clover not reporting an amount is not evidence of a mismatch — don't invent one.
  it("settles clean when the charged amount is unknown", () => {
    expect(resolveSettlement(11.29, null).mismatch).toBe(false);
    expect(resolveSettlement(11.29, undefined).paymentStatus).toBe("paid");
    expect(resolveSettlement(11.29, undefined).settledTotal).toBe(11.29);
  });

  it("records the charged amount, not the quote, on an overcharge", () => {
    const s = resolveSettlement(11.29, 1229);
    expect(s).toMatchObject({
      mismatch: true,
      settledTotal: 12.29,
      deltaCents: 100,
      paymentStatus: "pending_verification",
      adjustmentDirection: "credit",
    });
  });

  it("flags an undercharge as a debit adjustment", () => {
    const s = resolveSettlement(11.29, 1029);
    expect(s).toMatchObject({
      mismatch: true,
      settledTotal: 10.29,
      deltaCents: -100,
      adjustmentDirection: "debit",
    });
  });

  it("catches a one-cent drift", () => {
    expect(resolveSettlement(11.29, 1130).mismatch).toBe(true);
  });

  it("does not trip on float representation of the quoted total", () => {
    // 0.1 + 0.2 style drift must not read as a mismatch.
    expect(resolveSettlement(0.3, 30).mismatch).toBe(false);
    expect(resolveSettlement(19.99, 1999).mismatch).toBe(false);
  });

  it("treats a zero charge as a real mismatch, not a missing value", () => {
    const s = resolveSettlement(11.29, 0);
    expect(s.mismatch).toBe(true);
    expect(s.paymentStatus).toBe("pending_verification");
  });
});
