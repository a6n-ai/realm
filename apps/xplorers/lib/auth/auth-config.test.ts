import { describe, expect, it } from "vitest";
import { auth } from "./index";

describe("auth config for Workers", () => {
  it("keeps rate-limit counters in Postgres, not isolate memory", () => {
    expect(auth.options.rateLimit?.storage).toBe("database");
  });

  it("reads the client IP from Cloudflare first, then Caddy", () => {
    expect(auth.options.advanced?.ipAddress?.ipAddressHeaders).toEqual(["cf-connecting-ip", "x-real-ip"]);
  });
});
