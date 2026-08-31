import { describe, expect, it, vi } from "vitest";
import {
  CloverApiClient,
  connectCloverWithApiToken,
  createCloverClient,
  disconnectClover,
  isCloverEcommerceConfigured,
  parseCloverConnection,
  toPublicCloverConnection,
  verifyCloverApiToken,
  type CloverConnection,
  type IntegrationsConfig,
  type IntegrationsConfigStore,
} from "../index";

function memoryStore(initial: IntegrationsConfig = {}): IntegrationsConfigStore {
  let cfg = initial;
  return {
    get: async () => cfg,
    set: async (next) => {
      cfg = next;
    },
  };
}

const apiTokenConnection: CloverConnection = {
  installed: true,
  connected: true,
  authMode: "apiToken",
  merchantId: "MERCH1",
  apiToken: "tok-secret",
  environment: "production",
  region: "na",
};

function okFetch(body: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
}

describe("API-token auth mode", () => {
  it("defaults existing persisted connections to oauth", () => {
    const parsed = parseCloverConnection({
      installed: true,
      connected: true,
      merchantId: "M1",
      tokens: {
        accessToken: "a",
        refreshToken: "r",
        accessTokenExpiration: 9_999_999_999,
        refreshTokenExpiration: 9_999_999_999,
      },
    });
    expect(parsed.authMode).toBe("oauth");
  });

  it("sends the API token as the bearer credential without app credentials", async () => {
    const fetchImpl = okFetch({ id: "MERCH1", name: "Puchka Man" });
    const client = new CloverApiClient({ connection: apiTokenConnection, fetchImpl });

    const merchant = await client.getMerchant();

    expect(merchant.name).toBe("Puchka Man");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.clover.com/v3/merchants/MERCH1/");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok-secret");
  });

  it("never attempts a refresh even when an expired OAuth token pair lingers", async () => {
    const fetchImpl = okFetch({ id: "MERCH1", name: "Puchka Man" });
    const onTokensRefreshed = vi.fn();
    const client = new CloverApiClient({
      connection: {
        ...apiTokenConnection,
        tokens: {
          accessToken: "stale",
          refreshToken: "stale-r",
          accessTokenExpiration: 1,
          refreshTokenExpiration: 1,
        },
      },
      fetchImpl,
      onTokensRefreshed,
    });

    expect(await client.getAccessToken()).toBe("tok-secret");
    expect(onTokensRefreshed).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("routes Ecommerce calls to the Ecommerce token, Platform calls to the Platform token", async () => {
    const fetchImpl = okFetch({ id: "MERCH1", name: "Puchka Man" });
    const client = new CloverApiClient({
      connection: {
        ...apiTokenConnection,
        ecommercePublicKey: "pk_live",
        ecommercePrivateToken: "ecom-secret",
      },
      fetchImpl,
    });

    await client.getMerchant();
    await client.request(`${client.ecommerceOrigin()}/v1/orders`, { method: "GET" });

    const auth = (i: number) =>
      new Headers((fetchImpl.mock.calls[i] as unknown as [string, RequestInit])[1].headers).get(
        "Authorization",
      );
    expect(auth(0)).toBe("Bearer tok-secret");
    expect(auth(1)).toBe("Bearer ecom-secret");
  });

  it("returns the PAKMS key from config instead of fetching it", async () => {
    const fetchImpl = okFetch({});
    const client = new CloverApiClient({
      connection: { ...apiTokenConnection, ecommercePublicKey: "pk_live" },
      fetchImpl,
    });
    expect(await client.getPakmsApiKey()).toEqual({ apiAccessKey: "pk_live" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails loudly on an Ecommerce call when no Ecommerce token is configured", async () => {
    const client = new CloverApiClient({ connection: apiTokenConnection, fetchImpl: okFetch({}) });
    await expect(
      client.request(`${client.ecommerceOrigin()}/v1/orders`, { method: "GET" }),
    ).rejects.toThrow(/Ecommerce API token is not configured/);
  });

  it("throws a clear error when the mode is set but the token is missing", async () => {
    const client = new CloverApiClient({
      connection: { ...apiTokenConnection, apiToken: undefined },
      fetchImpl: okFetch({}),
    });
    await expect(client.getAccessToken()).rejects.toThrow(/missing API token/);
  });

  it("verifyCloverApiToken surfaces a rejected token as an error", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ message: "401 Unauthorized" }), { status: 401 }),
    ) as typeof fetch;
    try {
      await expect(
        verifyCloverApiToken({
          merchantId: "MERCH1",
          apiToken: "bad",
          environment: "production",
          region: "na",
        }),
      ).rejects.toThrow(/Clover API 401/);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe("connect / disconnect round-trip", () => {
  it("persists an API-token connection and clears any OAuth tokens", async () => {
    const store = memoryStore({
      clover: {
        installed: true,
        connected: true,
        authMode: "oauth",
        merchantId: "OLD",
        environment: "sandbox",
        region: "na",
        tokens: {
          accessToken: "a",
          refreshToken: "r",
          accessTokenExpiration: 9_999_999_999,
          refreshTokenExpiration: 9_999_999_999,
        },
      },
    });

    await connectCloverWithApiToken(store, {
      merchantId: "MERCH1",
      apiToken: "tok-secret",
      environment: "production",
      region: "na",
    });

    const cfg = (await store.get()).clover as CloverConnection;
    expect(cfg.authMode).toBe("apiToken");
    expect(cfg.merchantId).toBe("MERCH1");
    expect(cfg.apiToken).toBe("tok-secret");
    expect(cfg.tokens).toBeUndefined();
    expect(cfg.connectedAt).toBeTruthy();
  });

  it("disconnect clears the API token and resets the mode", async () => {
    const store = memoryStore({ clover: apiTokenConnection });
    await disconnectClover(store);
    const cfg = (await store.get()).clover as CloverConnection;
    expect(cfg.connected).toBe(false);
    expect(cfg.authMode).toBe("oauth");
    expect(cfg.apiToken).toBeUndefined();
    expect(cfg.merchantId).toBeUndefined();
  });

  it("createCloverClient builds a client with no CLOVER_APP_ID in env", async () => {
    const appId = process.env.CLOVER_APP_ID;
    const appSecret = process.env.CLOVER_APP_SECRET;
    delete process.env.CLOVER_APP_ID;
    delete process.env.CLOVER_APP_SECRET;
    try {
      const client = await createCloverClient(memoryStore({ clover: apiTokenConnection }));
      expect(client).not.toBeNull();
      expect(await client!.getAccessToken()).toBe("tok-secret");
    } finally {
      if (appId) process.env.CLOVER_APP_ID = appId;
      if (appSecret) process.env.CLOVER_APP_SECRET = appSecret;
    }
  });
});

describe("public projection", () => {
  it("reports connected and a permanent token, and never leaks the token", () => {
    const pub = toPublicCloverConnection(apiTokenConnection);
    expect(pub.connected).toBe(true);
    expect(pub.accessTokenValid).toBe(true);
    expect(pub.authMode).toBe("apiToken");
    expect(JSON.stringify(pub)).not.toContain("tok-secret");
  });

  it("is connected but not ecommerce-ready with only a Platform token", () => {
    const pub = toPublicCloverConnection(apiTokenConnection);
    expect(pub.connected).toBe(true);
    expect(pub.ecommerceReady).toBe(false);
    expect(isCloverEcommerceConfigured(apiTokenConnection)).toBe(false);
  });

  it("is ecommerce-ready once both Ecommerce values are present", () => {
    const conn = {
      ...apiTokenConnection,
      ecommercePublicKey: "pk_live",
      ecommercePrivateToken: "ecom-secret",
    };
    expect(toPublicCloverConnection(conn).ecommerceReady).toBe(true);
    expect(isCloverEcommerceConfigured(conn)).toBe(true);
  });

  it("half-configured Ecommerce credentials are not ready", () => {
    expect(
      isCloverEcommerceConfigured({ ...apiTokenConnection, ecommercePublicKey: "pk_live" }),
    ).toBe(false);
  });

  it("OAuth connections are always ecommerce-ready — one token covers both surfaces", () => {
    expect(
      isCloverEcommerceConfigured({
        installed: true,
        connected: true,
        authMode: "oauth",
        merchantId: "M1",
        environment: "production",
        region: "na",
        tokens: {
          accessToken: "a",
          refreshToken: "r",
          accessTokenExpiration: 9_999_999_999,
          refreshTokenExpiration: 9_999_999_999,
        },
      }),
    ).toBe(true);
  });

  it("is not connected when the API token is gone", () => {
    const pub = toPublicCloverConnection({ ...apiTokenConnection, apiToken: undefined });
    expect(pub.connected).toBe(false);
    expect(pub.accessTokenValid).toBe(false);
  });
});
