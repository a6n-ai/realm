import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

test("off Workers the cache is LRU-only", async () => {
  const { sharedCache } = await import("./cache");
  const cache = sharedCache("build-probe");
  await cache.set("k", 42);
  expect((await cache.get<number>("k"))?.value).toBe(42);
});
