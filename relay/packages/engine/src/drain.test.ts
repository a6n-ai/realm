import { describe, expect, it, vi } from "vitest";
import { createRateLimiter } from "./drain";

describe("createRateLimiter", () => {
  it("allows a full bucket to drain without waiting", async () => {
    vi.useFakeTimers();
    const limiter = createRateLimiter(10, () => Date.now());
    const started = Date.now();
    for (let i = 0; i < 10; i++) await limiter.take();
    expect(Date.now() - started).toBe(0);
    vi.useRealTimers();
  });

  it("reports the wait needed once the bucket is empty", () => {
    let now = 0;
    const limiter = createRateLimiter(10, () => now);
    for (let i = 0; i < 10; i++) limiter.tryTake();
    expect(limiter.tryTake()).toBe(false);
    now += 100; // one token refills at 10/s
    expect(limiter.tryTake()).toBe(true);
  });

  it("never accumulates more than one second of tokens", () => {
    let now = 0;
    const limiter = createRateLimiter(5, () => now);
    now += 60_000;
    let taken = 0;
    while (limiter.tryTake()) taken++;
    expect(taken).toBe(5);
  });
});
