import { afterEach, describe, expect, it, vi } from "vitest";
import { KvTier, type KvLike } from "./kv-tier";

function fakeKv(): KvLike & { store: Map<string, string>; ttls: Map<string, number | undefined> } {
  const store = new Map<string, string>();
  const ttls = new Map<string, number | undefined>();
  return {
    store,
    ttls,
    get: async (k) => store.get(k) ?? null,
    put: async (k, v, o) => {
      store.set(k, v);
      ttls.set(k, o?.expirationTtl);
    },
    delete: async (k) => void store.delete(k),
    list: async ({ prefix }) => ({
      keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })),
      list_complete: true,
    }),
  };
}

describe("KvTier", () => {
  it("round-trips a value, including null and bigint", async () => {
    const kv = fakeKv();
    const tier = new KvTier("c", () => kv);
    expect(await tier.get("c:a")).toBeUndefined();
    await tier.set("c:a", { n: 1n }, 120_000);
    expect(await tier.get("c:a")).toEqual({ value: { n: 1n } });
    await tier.set("c:b", null, 120_000);
    expect(await tier.get("c:b")).toEqual({ value: null });
  });

  it("clamps ttl to the 60s KV minimum", async () => {
    const kv = fakeKv();
    const tier = new KvTier("c", () => kv);
    await tier.set("c:a", 1, 5_000);
    await tier.set("c:b", 1, 90_500);
    await tier.set("c:c", 1);
    expect(kv.ttls.get("c:a")).toBe(60);
    expect(kv.ttls.get("c:b")).toBe(91);
    expect(kv.ttls.get("c:c")).toBeUndefined();
  });

  it("clear removes only its prefix", async () => {
    const kv = fakeKv();
    const mine = new KvTier("c", () => kv);
    const other = new KvTier("cc", () => kv);
    await mine.set("c:a", 1, 60_000);
    await other.set("cc:a", 1, 60_000);
    await mine.clear();
    expect(await mine.get("c:a")).toBeUndefined();
    expect(await other.get("cc:a")).toEqual({ value: 1 });
  });

  it("treats binding failures as a miss", async () => {
    const tier = new KvTier("c", () => {
      throw new Error("no binding");
    });
    expect(await tier.get("c:a")).toBeUndefined();
    await expect(tier.set("c:a", 1)).resolves.toBeUndefined();
  });
});

describe("config cache on Workers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.doUnmock("@opennextjs/cloudflare");
  });

  it("app-settings bypasses KV on Workers", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    const ctx = vi.fn(() => {
      throw new Error("KV touched");
    });
    vi.doMock("@opennextjs/cloudflare", () => ({ getCloudflareContext: ctx }));
    const { configCache } = await import("../cache");
    const c = configCache("app-settings");
    let calls = 0;
    const read = () => c.getOrSet("settings", async () => ++calls);
    expect(await read()).toBe(1);
    expect(await read()).toBe(1);
    expect(ctx).not.toHaveBeenCalled();
  });

  it("owner-pool bypasses KV on Workers", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    const ctx = vi.fn(() => {
      throw new Error("KV touched");
    });
    vi.doMock("@opennextjs/cloudflare", () => ({ getCloudflareContext: ctx }));
    vi.doMock("@/db/client", () => ({ db: {} }));
    const svc = await import("../services/owner-pool.service");
    await svc.resetPoolCache();
    expect(ctx).not.toHaveBeenCalled();
    vi.doUnmock("@/db/client");
  });

  it("sharedCache uses KV on Workers", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    const kv = fakeKv();
    vi.doMock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: { CACHE: kv } }) }));
    const { sharedCache } = await import("../cache");
    await sharedCache("x").set("k", 7);
    expect(kv.store.has("x:k")).toBe(true);
  });
});
