import { afterEach, describe, expect, it, vi } from "vitest";
import { trustedIpHeaders } from "./platform";

describe("trustedIpHeaders", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("trusts only cf-connecting-ip on Node, never a client-set x-real-ip", () => {
    expect(trustedIpHeaders()).toEqual(["cf-connecting-ip"]);
  });

  it("trusts only cf-connecting-ip on Workers", () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    expect(trustedIpHeaders()).toEqual(["cf-connecting-ip"]);
  });
});
