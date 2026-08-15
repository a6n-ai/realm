import { describe, expect, it } from "vitest";
import { commitRedemption, lockAndQuoteRedemption } from "../service";

/**
 * Structural regression test, not a concurrency test: a real double-spend
 * needs two overlapping live-DB transactions racing on a `FOR UPDATE` lock,
 * which this fake-tx unit test cannot reproduce. What it DOES pin is
 * cheaper and just as load-bearing — the fixed lock/check sequence, on
 * every call, unconditionally:
 *
 *   lockAndQuoteRedemption: user lock -> balance read
 *   commitRedemption:       order lock -> duplicate check -> writes
 *
 * If the duplicate check is hoisted out of commitRedemption to run before
 * either lock (the bug the coordinator caught twice now), this fails
 * without needing two connections to race.
 *
 * The fake `tx` records invocation order instead of touching a real DB.
 * `select().from().where()` is both directly awaitable (the balance read)
 * and chainable via `.limit()` (the duplicate-order lookup), and
 * `insert().values()` records the write — mirrors the real call shapes.
 */
function makeFakeTx(calls: string[]) {
  return {
    execute: async () => {
      calls.push(calls.includes("user-lock") ? "order-lock" : "user-lock");
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
    insert: () => ({
      values: async () => {
        calls.push("write");
      },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("redemption lock/check ordering", () => {
  it("locks user then order, checks for a duplicate only after both locks, before any write", async () => {
    const calls: string[] = [];
    const fakeTx = makeFakeTx(calls);

    await lockAndQuoteRedemption(fakeTx, {
      userId: 1n,
      coins: 10,
      rate: 0.1,
      cap: 100,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      walletLedger: {} as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      users: {} as any,
    });

    await commitRedemption(fakeTx, {
      userId: 1n,
      coins: 10,
      currencyValue: 1,
      orderId: 5n,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      walletLedger: {} as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      orders: {} as any,
      recordRedemptionDiscount: async () => {
        calls.push("write");
      },
    });

    expect(calls).toEqual(["user-lock", "balance-read", "order-lock", "dup-check", "write", "write"]);
  });
});
