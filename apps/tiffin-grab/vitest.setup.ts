// Live-DB / Redis project only (see vitest.config): the shared stubs plus per-test cache flush and catalog restore.
import { afterAll, beforeEach } from "vitest";
import { getRedis } from "./lib/redis";
import { ensureSeededCatalog } from "./db/test-helpers";

// The live-DB suites share one Redis (the cache L2 tier), which persists across
// test files in the serial run — a suite would otherwise read another suite's
// stale cache. Flush the dedicated test DB (index 15, see vitest.config) before
// each test so every suite starts from cold cache. Idempotent for files that
// never touch Redis.
beforeEach(async () => {
  await getRedis().flushdb();
});

// Restore the seeded catalog if a suite blanket-deleted dishes in its cleanup.
afterAll(async () => {
  await ensureSeededCatalog();
});

