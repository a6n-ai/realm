import { describe, expect, it } from "vitest";
import {
  buildCloverAuthorizeUrl,
  isCloverAccessTokenExpired,
  parseCloverOAuthCallback,
  parseIntegrationsConfig,
  resolveCloverHosts,
  toPublicCloverConnection,
} from "../index";

describe("resolveCloverHosts", () => {
  it("returns sandbox hosts regardless of region", () => {
    const h = resolveCloverHosts("sandbox", "eu");
    expect(h.authorizeHost).toBe("sandbox.dev.clover.com");
    expect(h.apiHost).toBe("apisandbox.dev.clover.com");
  });

  it("returns NA production hosts", () => {
    const h = resolveCloverHosts("production", "na");
    expect(h.authorizeHost).toBe("www.clover.com");
    expect(h.apiHost).toBe("api.clover.com");
  });
});

describe("buildCloverAuthorizeUrl", () => {
  it("builds sandbox authorize URL with required params", () => {
    const url = buildCloverAuthorizeUrl({
      appId: "APP123",
      redirectUri: "http://localhost:3000/api/integrations/clover/callback",
      state: "csrf-1",
      environment: "sandbox",
    });
    const u = new URL(url);
    expect(u.origin).toBe("https://sandbox.dev.clover.com");
    expect(u.pathname).toBe("/oauth/v2/authorize");
    expect(u.searchParams.get("client_id")).toBe("APP123");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("redirect_uri")).toContain("/api/integrations/clover/callback");
    expect(u.searchParams.get("state")).toBe("csrf-1");
  });
});

describe("parseCloverOAuthCallback", () => {
  it("reads code and merchant_id from URLSearchParams", () => {
    const p = parseCloverOAuthCallback(
      new URLSearchParams("code=abc&merchant_id=M1&state=s"),
    );
    expect(p).toEqual({ code: "abc", merchantId: "M1", state: "s", error: null });
  });
});

describe("token expiry", () => {
  it("treats near-expiry as expired with skew", () => {
    const now = 1_700_000_000;
    expect(
      isCloverAccessTokenExpired(
        {
          accessToken: "a",
          refreshToken: "r",
          accessTokenExpiration: now + 30,
          refreshTokenExpiration: now + 10_000,
        },
        60,
        now,
      ),
    ).toBe(true);
    expect(
      isCloverAccessTokenExpired(
        {
          accessToken: "a",
          refreshToken: "r",
          accessTokenExpiration: now + 120,
          refreshTokenExpiration: now + 10_000,
        },
        60,
        now,
      ),
    ).toBe(false);
  });
});

describe("config helpers", () => {
  it("parses empty integrations config", () => {
    expect(parseIntegrationsConfig(undefined)).toEqual({});
  });

  it("strips tokens from public projection", () => {
    const pub = toPublicCloverConnection({
      installed: true,
      connected: true,
      merchantId: "M1",
      environment: "sandbox",
      region: "na",
      tokens: {
        accessToken: "secret",
        refreshToken: "secret2",
        accessTokenExpiration: Math.floor(Date.now() / 1000) + 3600,
        refreshTokenExpiration: Math.floor(Date.now() / 1000) + 86_400,
      },
    });
    expect(pub).toMatchObject({
      installed: true,
      connected: true,
      merchantId: "M1",
      accessTokenValid: true,
    });
    expect(pub).not.toHaveProperty("tokens");
  });
});
