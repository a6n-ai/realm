import { describe, expect, it } from "vitest";
import { lockAndQuoteRedemption } from "../service";

/**
 * Structural regression test, not a concurrency test: a real double-spend
 * needs two overlapping live-DB transactions racing on the `FOR UPDATE`
 * lock, which this fake-tx unit test cannot reproduce. What it DOES pin is
 * cheaper and just as load-bearing — the row lock must be requested before
 * the duplicate-order lookup runs, on every call, unconditionally. If that
 * ordering regresses (the bug the coordinator caught: duplicate check moved
 * ahead of the lock), this fails without needing two connections to race.
 *
 * The fake `tx` below records invocation order instead of touching a real
 * DB. `select().from().where()` is both directly awaitable (the balance
 * read) and chainable via `.limit()` (the duplicate-order lookup) — mirrors
 * the two real call shapes in lockAndQuoteRedemption/assertNotAlreadyRedeemed.
 */
function makeFakeTx(calls: string[]) {
  return {
    execute: async () => {
      calls.push("lock");
    },
    select: () => ({
      from: () => ({
        where: () => ({
          then: (resolve: (v: unknown) => void) => {
            calls.push("balance-read");
            resolve([{ bal: 100_000 }]);
          },
          limit: async () => {
            calls.push("dup-check");
            return [];
          },
        }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("lockAndQuoteRedemption ordering", () => {
  it("takes the FOR UPDATE lock before running the duplicate-order check", async () => {
    const calls: string[] = [];
    await lockAndQuoteRedemption(makeFakeTx(calls), {
      userId: 1n,
      coins: 10,
      rate: 0.1,
      cap: 100,
      orderId: 5n,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      walletLedger: {} as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      users: {} as any,
    });

    expect(calls).toContain("lock");
    expect(calls).toContain("dup-check");
    expect(calls.indexOf("lock")).toBeLessThan(calls.indexOf("dup-check"));
  });

  it("skips the duplicate check entirely when no orderId is given (checkout's pre-order-row quote)", async () => {
    const calls: string[] = [];
    await lockAndQuoteRedemption(makeFakeTx(calls), {
      userId: 1n,
      coins: 10,
      rate: 0.1,
      cap: 100,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      walletLedger: {} as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      users: {} as any,
    });

    expect(calls).toEqual(["lock", "balance-read"]);
  });
});
