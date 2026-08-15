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
 *   commitRedemption:       user lock -> order lock -> duplicate check ->
 *                           balance re-read -> writes
 *
 * If the duplicate check is hoisted out of commitRedemption to run before
 * either lock (the bug the coordinator caught twice now), this fails
 * without needing two connections to race. Likewise if commitRedemption
 * stops re-reading the balance before writing, or takes the order lock
 * before the user lock.
 *
 * The fake `tx` records invocation order instead of touching a real DB.
 * `execute` reads which fake table the FOR UPDATE interpolated — drizzle
 * parks interpolated values verbatim on `queryChunks` until the query is
 * built, so the tagged `__lock` name survives — so the two locks are told
 * apart by the row they take, not by call position. Position alone would
 * pass a commitRedemption that took the order lock first.
 * `select().from().where()` is both directly awaitable
 * (the balance reads) and chainable via `.limit()` (the duplicate-order
 * lookup), and `insert().values()` records the write.
 */
const USERS = { __lock: "user-lock", id: 1 };
const ORDERS = { __lock: "order-lock", id: 1 };

function makeFakeTx(calls: string[]) {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async (q: any) => {
      const tagged = (q?.queryChunks ?? [])
        .map((c: { __lock?: string }) => c?.__lock)
        .filter(Boolean);
      calls.push(tagged[0] ?? "unknown-lock");
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

function commitArgs(calls: string[], over: { coins?: number } = {}) {
  return {
    userId: 1n,
    coins: over.coins ?? 10,
    currencyValue: 1,
    orderId: 5n,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    walletLedger: {} as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    orders: ORDERS as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    users: USERS as any,
    recordRedemptionDiscount: async () => {
      calls.push("write");
    },
  };
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
      users: USERS as any,
    });

    await commitRedemption(fakeTx, commitArgs(calls));

    expect(calls).toEqual([
      "user-lock", "balance-read",
      "user-lock", "order-lock", "dup-check", "balance-read", "write", "write",
    ]);
  });

  // verifyPayment settles a DEFERRED redemption without ever calling the quote,
  // so commitRedemption must stand alone: it takes the user lock itself (nobody
  // holds it on this path) and re-reads the balance itself before writing.
  it("takes both locks and re-reads the balance when called bare, with no preceding quote", async () => {
    const calls: string[] = [];
    const fakeTx = makeFakeTx(calls);

    await commitRedemption(fakeTx, commitArgs(calls));

    expect(calls).toEqual(["user-lock", "order-lock", "dup-check", "balance-read", "write", "write"]);
  });

  it("refuses to write a debit the re-read balance cannot cover", async () => {
    const calls: string[] = [];
    const fakeTx = makeFakeTx(calls);

    // Fake balance is 100_000; ask for more.
    await expect(commitRedemption(fakeTx, commitArgs(calls, { coins: 100_001 })))
      .rejects.toThrow(/insufficient coins to settle redemption/i);

    expect(calls).not.toContain("write");
  });
});
