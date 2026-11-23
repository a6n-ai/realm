import { afterEach, describe, expect, it, test, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

test("off Workers the cache is LRU-only", async () => {
  const { sharedCache } = await import("./cache");
  const cache = sharedCache("build-probe");
  // A shared tier returning would make this 2: only Workers get KV.
  expect((cache as unknown as { opts: { tiers: unknown[] } }).opts.tiers).toHaveLength(1);
  await cache.set("k", 42);
  expect((await cache.get<number>("k"))?.value).toBe(42);
});

function fakeKv() {
  const store = new Map<string, string>();
  return {
    store,
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => void store.set(k, v),
    delete: async (k: string) => void store.delete(k),
    list: async ({ prefix }: { prefix: string }) => ({ keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }),
  };
}

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
    const { configCache } = await import("./cache");
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
    const svc = await import("./staff/owner-pool.service");
    await svc.resetPoolCache();
    expect(ctx).not.toHaveBeenCalled();
    vi.doUnmock("@/db/client");
  });

  it("sharedCache uses KV on Workers", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    const kv = fakeKv();
    vi.doMock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: { CACHE: kv } }) }));
    const { sharedCache } = await import("./cache");
    await sharedCache("x").set("k", 7);
    expect(kv.store.has("x:k")).toBe(true);
  });
});
