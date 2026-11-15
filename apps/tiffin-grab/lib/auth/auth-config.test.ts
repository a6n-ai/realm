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
  it("keeps rate-limit counters in memory on Node and trusts only cf-connecting-ip", async () => {
    const { auth, trusted } = await loadAuth(false);
    expect(auth.options.rateLimit?.storage).toBe("memory");
    expect(auth.options.advanced?.ipAddress?.ipAddressHeaders).toEqual(trusted);
    expect(trusted).toEqual(["cf-connecting-ip"]);
  });

  it("uses the database store and cf-connecting-ip on Workers", async () => {
    const { auth, trusted } = await loadAuth(true);
    expect(auth.options.rateLimit?.storage).toBe("database");
    expect(auth.options.advanced?.ipAddress?.ipAddressHeaders).toEqual(trusted);
    expect(trusted).toEqual(["cf-connecting-ip"]);
  });
});

describe("disabled HTTP paths", () => {
  it("404s every org/admin mutation over the HTTP handler", async () => {
    const { auth } = await loadAuth(false);
    const { DISABLED_PATHS } = await import("./index");
    for (const path of DISABLED_PATHS.filter((p) => p !== "/sign-in/magic-link")) {
      const res = await auth.handler(
        new Request(`http://localhost:3000/api/auth${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
      );
      expect(res.status, path).toBe(404);
    }
  });

  it("keeps client-used routes mounted", async () => {
    const { DISABLED_PATHS } = await import("./index");
    for (const p of ["/organization/set-active", "/organization/accept-invitation", "/get-session"]) {
      expect(DISABLED_PATHS).not.toContain(p);
    }
  });
});
