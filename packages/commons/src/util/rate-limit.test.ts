import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { isRateLimited } = await import("./rate-limit");

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("isRateLimited", () => {
  it("allows a key under the limit", () => {
    for (let i = 0; i < 3; i++) expect(isRateLimited("a", 3, 1000)).toBe(false);
  });

  it("blocks a key over the limit", () => {
    const key = "b";
    for (let i = 0; i < 3; i++) isRateLimited(key, 3, 1000);
    expect(isRateLimited(key, 3, 1000)).toBe(true);
  });

  it("resets after the window passes", () => {
    const key = "c";
    for (let i = 0; i < 3; i++) isRateLimited(key, 3, 1000);
    expect(isRateLimited(key, 3, 1000)).toBe(true);

    vi.advanceTimersByTime(1001);
    expect(isRateLimited(key, 3, 1000)).toBe(false);
  });

  it("tracks different keys independently", () => {
    const busy = "d1";
    const fresh = "d2";
    for (let i = 0; i < 3; i++) isRateLimited(busy, 3, 1000);
    expect(isRateLimited(busy, 3, 1000)).toBe(true);
    expect(isRateLimited(fresh, 3, 1000)).toBe(false);
  });

  it("evicts expired entries so a long-idle key behaves like a fresh one", () => {
    const key = "e";
    isRateLimited(key, 1, 1000);
    expect(isRateLimited(key, 1, 1000)).toBe(true);

    // Sweep fires every 500 calls (SWEEP_INTERVAL); churn enough distinct
    // keys, all past their window, to force a sweep and evict `key`.
    vi.advanceTimersByTime(1001);
    for (let i = 0; i < 500; i++) isRateLimited(`churn-${i}`, 1, 1000);

    // Post-eviction, `key` starts a fresh window rather than resuming a
    // stale one — same observable behaviour as a never-seen key.
    expect(isRateLimited(key, 1, 1000)).toBe(false);
  });

  it("folds an IPv4-mapped IPv6 address to its IPv4 bucket", () => {
    isRateLimited("::ffff:192.0.2.1", 1, 1000);
    expect(isRateLimited("192.0.2.1", 1, 1000)).toBe(true);
  });

  it("buckets IPv6 addresses in the same /64 together", () => {
    isRateLimited("2001:db8::1", 1, 1000);
    expect(isRateLimited("2001:db8::2", 1, 1000)).toBe(true);
  });

  it("keeps IPv6 addresses in different /64s independent", () => {
    isRateLimited("2001:db8:1::1", 1, 1000);
    expect(isRateLimited("2001:db8:2::1", 1, 1000)).toBe(false);
  });

  it("keeps IPv4 addresses bucketed individually", () => {
    isRateLimited("203.0.113.1", 1, 1000);
    expect(isRateLimited("203.0.113.2", 1, 1000)).toBe(false);
  });
});
