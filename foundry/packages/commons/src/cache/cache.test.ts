import { describe, it, expect } from "vitest";
import { LruTier } from "./lru-tier";
import { TieredCache } from "./tiered-cache";

const tc = (opts: Partial<ConstructorParameters<typeof TieredCache>[0]> = {}) =>
  new TieredCache({ name: "t", tiers: [new LruTier()], ...opts });

describe("TieredCache", () => {
  it("getOrSet computes once then serves from cache", async () => {
    let calls = 0;
    const c = tc();
    const supplier = async () => { calls++; return 42; };
    expect(await c.getOrSet("k", supplier)).toBe(42);
    expect(await c.getOrSet("k", supplier)).toBe(42);
    expect(calls).toBe(1);
  });

  it("single-flights concurrent misses (one supplier call)", async () => {
    let calls = 0;
    const c = tc();
    const supplier = async () => { calls++; await new Promise((r) => setTimeout(r, 10)); return "v"; };
    const [a, b, d] = await Promise.all([c.getOrSet("k", supplier), c.getOrSet("k", supplier), c.getOrSet("k", supplier)]);
    expect([a, b, d]).toEqual(["v", "v", "v"]);
    expect(calls).toBe(1);
  });

  it("evict forces recompute; evictAll clears everything", async () => {
    let calls = 0;
    const c = tc();
    const supplier = async () => { calls++; return calls; };
    expect(await c.getOrSet("k", supplier)).toBe(1);
    await c.evict("k");
    expect(await c.getOrSet("k", supplier)).toBe(2);
    await c.evictAll();
    expect(await c.getOrSet("k", supplier)).toBe(3);
  });

  it("does NOT cache null by default, but DOES with negativeCache", async () => {
    let calls = 0;
    const plain = tc();
    const nullSupplier = async () => { calls++; return null; };
    await plain.getOrSet("k", nullSupplier);
    await plain.getOrSet("k", nullSupplier);
    expect(calls).toBe(2); // recomputed — null not cached

    let negCalls = 0;
    const neg = tc({ negativeCache: true });
    const negSupplier = async () => { negCalls++; return null; };
    await neg.getOrSet("k", negSupplier);
    await neg.getOrSet("k", negSupplier);
    expect(negCalls).toBe(1); // null cached as a real hit
  });

  it("backfills a nearer tier on a far-tier hit", async () => {
    const near = new LruTier();
    const far = new LruTier();
    const c = new TieredCache({ name: "t", tiers: [near, far] });
    await far.set("t:k", "fromFar"); // seed only the far tier (full key includes namespace)
    expect((await c.get<string>("k"))?.value).toBe("fromFar");
    // near tier should now hold it (backfilled), independent of far
    expect((await near.get<string>("t:k"))?.value).toBe("fromFar");
  });

  it("namespaces keys so two caches over the same tier don't collide", async () => {
    const shared = new LruTier();
    const a = new TieredCache({ name: "a", tiers: [shared] });
    const b = new TieredCache({ name: "b", tiers: [shared] });
    await a.set("k", 1);
    await b.set("k", 2);
    expect((await a.get<number>("k"))?.value).toBe(1);
    expect((await b.get<number>("k"))?.value).toBe(2);
  });
});
