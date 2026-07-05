import { beforeEach } from "vitest";
import { getRedis } from "./lib/redis";

// input-otp (and other measure-on-mount UI) needs ResizeObserver, which jsdom
// lacks. Stub it globally; harmless in the node-env test files.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// The live-DB suites share one Redis (the cache L2 tier), which persists across
// test files in the serial run — a suite would otherwise read another suite's
// stale cache. Flush the dedicated test DB (index 15, see vitest.config) before
// each test so every suite starts from cold cache. Idempotent for files that
// never touch Redis.
beforeEach(async () => {
  await getRedis().flushdb();
});
