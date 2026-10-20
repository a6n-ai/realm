import { afterAll, beforeEach, vi } from "vitest";
import { getRedis } from "./lib/redis";
import { ensureSeededCatalog } from "./db/test-helpers";

// Start dates roll to the next day at the app cutoff hour. Suites book
// `nextWeekday(new Date())`, which that rule refuses between the cutoff and UTC
// midnight, so the wall clock is taken out of it here. app-today.test.ts and
// start-date-cutoff.test.ts unmock this to test the real rule.
vi.mock("@/lib/services/start-date", async (importOriginal) => {
  const real = await importOriginal<typeof import("./lib/services/start-date")>();
  return { ...real, appToday: (timezone?: string, _cutoffHour?: number, now?: number) => real.appToday(timezone, undefined, now) };
});

// input-otp (and other measure-on-mount UI) needs ResizeObserver, which jsdom
// lacks. Stub it globally; harmless in the node-env test files.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// input-otp also polls document.elementFromPoint (for focus/caret tracking),
// which jsdom lacks. Stub it to a no-op so typing into the hidden input works.
// Guarded: this file also runs in node-env test files, which have no `document`.
if (typeof document !== "undefined") {
  document.elementFromPoint ??= () => null;
}

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

