import { afterEach, describe, expect, it, vi } from "vitest";
import { trustedIpHeaders } from "./platform";

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
