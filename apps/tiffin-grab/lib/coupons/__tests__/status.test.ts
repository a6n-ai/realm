import { describe, expect, it } from "vitest";
import { couponStatus } from "../status";

describe("couponStatus", () => {
  const now = 1_000;
  it("covers every state and the boundaries", () => {
    expect(couponStatus({ active: false }, now)).toBe("inactive");
    expect(couponStatus({ active: true, startsAt: 1_001 }, now)).toBe("scheduled");
    expect(couponStatus({ active: true, startsAt: 1_000, expiresAt: 1_000 }, now)).toBe("active");
    expect(couponStatus({ active: true, expiresAt: 999 }, now)).toBe("expired");
    expect(couponStatus({ active: true }, now)).toBe("active");
  });
});
