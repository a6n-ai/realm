import { describe, it, expect } from "vitest";
import { canClaim, canVerify, type PaymentLifecycle } from "../index";

describe("lifecycle predicates", () => {
  it("canClaim is true only for awaiting_payment or rejected", () => {
    const claimable: PaymentLifecycle[] = ["awaiting_payment", "rejected"];
    const notClaimable: PaymentLifecycle[] = ["pending_verification", "paid", "refunded"];
    for (const s of claimable) expect(canClaim(s)).toBe(true);
    for (const s of notClaimable) expect(canClaim(s)).toBe(false);
  });
  it("canVerify is true only for pending_verification", () => {
    expect(canVerify("pending_verification")).toBe(true);
    expect(canVerify("awaiting_payment")).toBe(false);
    expect(canVerify("paid")).toBe(false);
  });
});
