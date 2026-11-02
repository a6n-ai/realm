import { describe, expect, it } from "vitest";
import { auth } from "./index";

describe("auth config for Workers", () => {
  it("keeps rate-limit counters in Postgres, not isolate memory", () => {
    expect(auth.options.rateLimit?.storage).toBe("database");
  });

  it("trusts exactly one proxy-set IP header (x-real-ip under Node)", () => {
    expect(auth.options.advanced?.ipAddress?.ipAddressHeaders).toEqual(["x-real-ip"]);
  });
});
