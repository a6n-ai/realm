import { describe, expect, it } from "vitest";
import { allowOtpTo } from "../otp-throttle";

describe("per-address OTP caps", () => {
  it("caps one IP at 6 an hour without locking the customer out of their own IP", async () => {
    const t = 1_000_000;
    for (let i = 0; i < 6; i++) expect(await allowOtpTo("Victim@Target.ca", "6.6.6.6", t + i)).toBe(true);
    expect(await allowOtpTo("victim@target.ca", "6.6.6.6", t + 10)).toBe(false);
    expect(await allowOtpTo("victim@target.ca", "1.2.3.4", t + 10)).toBe(true);
  });

  it("caps an address at 30 an hour across many IPs", async () => {
    const t = 2_000_000;
    for (let i = 0; i < 30; i++) expect(await allowOtpTo("flood@target.ca", `10.0.0.${i}`, t)).toBe(true);
    expect(await allowOtpTo("flood@target.ca", "10.0.1.1", t)).toBe(false);
  });

  it("frees the address once the hour passes", async () => {
    const t = 5_000_000;
    for (let i = 0; i < 6; i++) await allowOtpTo("later@target.ca", "6.6.6.6", t);
    expect(await allowOtpTo("later@target.ca", "6.6.6.6", t + 60 * 60 * 1000)).toBe(true);
  });
});
