// Every project: clock-free start dates and the jsdom gaps UI tests need. No DB, no Redis.
import { vi } from "vitest";

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

