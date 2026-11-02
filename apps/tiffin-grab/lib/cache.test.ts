import { afterEach, expect, test, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

test("Workers build on Node without REDIS_URL gets an LRU-only cache", async () => {
  vi.stubEnv("BUILD_TARGET", "workers");
  vi.stubEnv("REDIS_URL", "");
  const { sharedCache } = await import("./cache");
  const cache = sharedCache("build-probe");
  await cache.set("k", 42);
  expect((await cache.get<number>("k"))?.value).toBe(42);
});
