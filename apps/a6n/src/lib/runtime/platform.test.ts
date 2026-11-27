import { afterEach, describe, expect, it, vi } from "vitest";
import { requestIp, trustedIpHeaders } from "./platform";

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

describe("requestIp", () => {
  it("reads the edge header and ignores a client-sent x-real-ip", () => {
    expect(requestIp(new Headers({ "x-real-ip": "6.6.6.6" }))).toBeNull();
    expect(requestIp(new Headers({ "x-real-ip": "6.6.6.6", "cf-connecting-ip": " 1.2.3.4 " }))).toBe("1.2.3.4");
  });
});
