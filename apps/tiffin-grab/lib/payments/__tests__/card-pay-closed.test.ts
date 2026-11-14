import { describe, expect, it } from "vitest";
import { cardPayClosed } from "../card-pay-closed";

describe("cardPayClosed", () => {
  const now = 1_000_000;
  it("is open for a live link on a running or pending order", () => {
    expect(cardPayClosed("pending", now + 1, now)).toBeNull();
    expect(cardPayClosed("active", null, now)).toBeNull();
  });
  it("closes on a cancelled order, an expired link and a void link (expiresAt 0)", () => {
    expect(cardPayClosed("cancelled", null, now)).toMatch(/cancelled/);
    expect(cardPayClosed("pending", now, now)).toMatch(/expired/);
    expect(cardPayClosed("active", 0, now)).toMatch(/expired/);
  });
});
