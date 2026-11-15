import { describe, expect, it } from "vitest";
import { needsCaptchaToken } from "@/lib/checkout/captcha-gate";

describe("needsCaptchaToken", () => {
  it("sends a token while the postal check is still pending", () => {
    expect(needsCaptchaToken(null)).toBe(true);
  });

  it("sends a token for an unserved address", () => {
    expect(needsCaptchaToken({ served: false })).toBe(true);
  });

  it("skips the token only for a known served address", () => {
    expect(needsCaptchaToken({ served: true })).toBe(false);
  });
});
