import { afterEach, describe, expect, it, vi } from "vitest";

async function loadAuth(workers: boolean) {
  vi.resetModules();
  if (workers) vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
  const { auth } = await import("./index");
  const { trustedIpHeaders } = await import("@/lib/runtime/platform");
  return { auth, trusted: trustedIpHeaders() };
}

afterEach(() => vi.unstubAllGlobals());

describe("auth config", () => {
  it("keeps rate-limit counters in memory on Node and trusts x-real-ip", async () => {
    const { auth, trusted } = await loadAuth(false);
    expect(auth.options.rateLimit?.storage).toBe("memory");
    expect(auth.options.advanced?.ipAddress?.ipAddressHeaders).toEqual(trusted);
    expect(trusted).toEqual(["x-real-ip"]);
  });

  it("uses the database store and cf-connecting-ip on Workers", async () => {
    const { auth, trusted } = await loadAuth(true);
    expect(auth.options.rateLimit?.storage).toBe("database");
    expect(auth.options.advanced?.ipAddress?.ipAddressHeaders).toEqual(trusted);
    expect(trusted).toEqual(["cf-connecting-ip"]);
  });
});
