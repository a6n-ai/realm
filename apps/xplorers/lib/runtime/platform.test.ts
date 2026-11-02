import { afterEach, describe, expect, it, vi } from "vitest";
import { isWorkers, trustedIpHeaders } from "./platform";

describe("isWorkers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is false under Node", () => {
    expect(isWorkers()).toBe(false);
  });

  it("is true when the Workers runtime identifies itself", () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    expect(isWorkers()).toBe(true);
  });
});

describe("trustedIpHeaders", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("trusts only Caddy's x-real-ip on Node", () => {
    expect(trustedIpHeaders()).toEqual(["x-real-ip"]);
  });

  it("trusts only cf-connecting-ip on Workers", () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    expect(trustedIpHeaders()).toEqual(["cf-connecting-ip"]);
  });
});
