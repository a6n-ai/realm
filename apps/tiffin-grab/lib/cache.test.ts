import { afterEach, expect, test, vi } from "vitest";

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
