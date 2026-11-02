import { describe, expect, it } from "vitest";
import { auth } from "./index";

describe("auth config for Workers", () => {
  it("keeps rate-limit counters in memory on Node until the Workers cutover", () => {
    expect(auth.options.rateLimit?.storage).toBe("memory");
  });

  it("trusts exactly one proxy-set IP header (x-real-ip under Node)", () => {
    expect(auth.options.advanced?.ipAddress?.ipAddressHeaders).toEqual(["x-real-ip"]);
  });
});
