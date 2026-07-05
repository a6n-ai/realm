import { describe, expect, it } from "vitest";
import { RedisTier, type RedisLike } from "./redis-tier";

/** In-memory RedisLike honoring the GET/SET(PX)/DEL/SCAN(MATCH) subset the tier uses. */
function fakeRedis() {
  const store = new Map<string, string>();
  const setArgs: unknown[][] = [];
  const client: RedisLike = {
    async get(k) {
      return store.get(k) ?? null;
    },
    async set(k, v, ...args) {
      setArgs.push(args);
      store.set(k, v);
      return "OK";
    },
    async del(...keys) {
      let n = 0;
      for (const k of keys) n += store.delete(k) ? 1 : 0;
      return n;
    },
    async scan(_cursor, ..._args) {
      // Single-pass: MATCH pattern is args[1] as `prefix:*`.
      const pattern = String(_args[1] ?? "*");
      const prefix = pattern.replace(/\*$/, "");
      const keys = [...store.keys()].filter((k) => k.startsWith(prefix));
      return ["0", keys];
    },
  };
  return { client, store, setArgs };
}

describe("RedisTier", () => {
  it("round-trips a value as a HIT and a true miss as undefined", async () => {
    const { client } = fakeRedis();
    const tier = new RedisTier(client, "cat");
    expect(await tier.get("cold")).toBeUndefined();
    await tier.set("k", { a: 1 });
    expect(await tier.get<{ a: number }>("k")).toEqual({ value: { a: 1 } });
  });

  it("negative-caches null/undefined as a HIT (distinguishable from a miss)", async () => {
    const { client } = fakeRedis();
    const tier = new RedisTier(client, "cat");
    await tier.set("n", null);
    expect(await tier.get("n")).toEqual({ value: null });
    await tier.set("u", undefined);
    expect(await tier.get("u")).toEqual({ value: undefined });
  });

  it("passes a positive ttl through as PX, omits it otherwise", async () => {
    const { client, setArgs } = fakeRedis();
    const tier = new RedisTier(client, "cat");
    await tier.set("a", 1, 5000);
    await tier.set("b", 2);
    expect(setArgs).toEqual([["PX", 5000], []]);
  });

  it("clear() SCAN+DEL only wipes this tier's prefix", async () => {
    const { client, store } = fakeRedis();
    store.set("cat:one", "x");
    store.set("cat:two", "y");
    store.set("other:keep", "z");
    await new RedisTier(client, "cat").clear();
    expect([...store.keys()]).toEqual(["other:keep"]);
  });

  it("never throws on a failing client — degrades to miss/no-op", async () => {
    const boom: RedisLike = {
      get: async () => {
        throw new Error("down");
      },
      set: async () => {
        throw new Error("down");
      },
      del: async () => {
        throw new Error("down");
      },
      scan: async () => {
        throw new Error("down");
      },
    };
    const tier = new RedisTier(boom, "cat");
    expect(await tier.get("k")).toBeUndefined();
    await expect(tier.set("k", 1)).resolves.toBeUndefined();
    await expect(tier.del("k")).resolves.toBeUndefined();
    await expect(tier.clear()).resolves.toBeUndefined();
  });
});
