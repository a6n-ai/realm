import { describe, expect, it } from "vitest";
import { allowOtpTo } from "../otp-throttle";

describe("per-address OTP cap", () => {
  it("allows 6 codes an hour per address, then drops", () => {
    const t = 1_000_000;
    for (let i = 0; i < 6; i++) expect(allowOtpTo("Bomb@Target.ca", t + i)).toBe(true);
    expect(allowOtpTo("bomb@target.ca", t + 10)).toBe(false);
    expect(allowOtpTo("someone@else.ca", t + 10)).toBe(true);
  });

  it("frees the address once the hour passes", () => {
    const t = 5_000_000;
    for (let i = 0; i < 6; i++) allowOtpTo("later@target.ca", t);
    expect(allowOtpTo("later@target.ca", t + 60 * 60 * 1000)).toBe(true);
  });
});
