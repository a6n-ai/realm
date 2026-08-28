import { describe, expect, it } from "vitest";
import { commitRedemption, lockAndQuoteRedemption, reserveRedemption, reverseAward, reverseRedemption, settleReservation } from "../service";

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

/**
 * Separate fake from `makeFakeTx` above: `reverseRedemption` runs two
 * sequential `.limit()` lookups (find the debit, then check for an existing
 * reversal) with different results each, rather than one balance-read plus
 * one dup-check, so the two lookups are told apart by a queue of canned
 * results rather than by a fixed query shape.
 */
function makeReversalFakeTx(calls: string[], limitResults: unknown[][], wheres: string[][] = []) {
  const queue = [...limitResults];
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        where: (cond: any) => ({
          limit: async () => {
            wheres.push(columnsIn(cond));
            const rows = queue.shift() ?? [];
            calls.push(rows.length ? "found" : "not-found");
            return rows;
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

/**
 * Walks a drizzle condition tree and collects the `__col` tags of the fake
 * columns it references. Same trick as the `__lock` scan above: interpolated
 * values sit verbatim on `queryChunks` until the query is built, and `and()`
 * nests its operand SQL objects there, so one recursive pass names every
 * column a WHERE clause filters on.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function columnsIn(node: any, out: string[] = []): string[] {
  if (!node || typeof node !== "object") return out;
  if (typeof node.__col === "string") out.push(node.__col);
  for (const chunk of node.queryChunks ?? []) columnsIn(chunk, out);
  return out;
}

const LEDGER = {
  id: { __col: "id" },
  coins: { __col: "coins" },
  userId: { __col: "userId" },
  sourceType: { __col: "sourceType" },
  sourceId: { __col: "sourceId" },
};

describe("reverseRedemption lock/check ordering", () => {
  it("locks user then order, before any read or write, then credits back the debited coins", async () => {
    const calls: string[] = [];
    const fakeTx = makeReversalFakeTx(calls, [[{ coins: 10 }], []]);

    const result = await reverseRedemption(fakeTx, {
      userId: 1n,
      orderId: 5n,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      walletLedger: {} as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      orders: ORDERS as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      users: USERS as any,
    });

    expect(calls).toEqual(["user-lock", "order-lock", "found", "not-found", "write"]);
    expect(result).toEqual({ coinsReturned: 10 });
  });

  it("is idempotent: a second call finds the existing reversal and writes nothing", async () => {
    const calls: string[] = [];
    const fakeTx = makeReversalFakeTx(calls, [[{ coins: 10 }], [{ id: 1 }]]);

    const result = await reverseRedemption(fakeTx, {
      userId: 1n,
      orderId: 5n,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      walletLedger: {} as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      orders: ORDERS as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      users: USERS as any,
    });

    expect(calls).toEqual(["user-lock", "order-lock", "found", "found"]);
    expect(result).toEqual({ coinsReturned: 0 });
  });

  it("is a silent no-op for an order with no redemption", async () => {
    const calls: string[] = [];
    const fakeTx = makeReversalFakeTx(calls, [[]]);

    const result = await reverseRedemption(fakeTx, {
      userId: 1n,
      orderId: 5n,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      walletLedger: {} as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      orders: ORDERS as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      users: USERS as any,
    });

    expect(calls).toEqual(["user-lock", "order-lock", "not-found"]);
    expect(result).toEqual({ coinsReturned: 0 });
  });

  /**
   * The debit lookup must be scoped to the user being credited. Today every
   * caller resolves owner and order to the same row, so an unscoped lookup is
   * harmless — but this is a shared primitive and that invariant lives entirely
   * in its callers. The reversal dedupe stays unscoped on purpose: a reversal
   * recorded by anyone for this order must block a second one.
   */
  it("looks the debit up by user AND order, but dedupes reversals by order alone", async () => {
    const calls: string[] = [];
    const wheres: string[][] = [];
    const fakeTx = makeReversalFakeTx(calls, [[{ coins: 10 }], []], wheres);

    await reverseRedemption(fakeTx, {
      userId: 1n,
      orderId: 5n,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      walletLedger: LEDGER as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      orders: ORDERS as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      users: USERS as any,
    });

    expect(wheres).toHaveLength(2);
    expect(wheres[0].sort()).toEqual(["sourceId", "sourceType", "userId"]);
    expect(wheres[1].sort()).toEqual(["sourceId", "sourceType"]);
  });
});

describe("reverseAward lock/check ordering", () => {
  it("locks the user, before any read or write, then debits back the awarded coins", async () => {
    const calls: string[] = [];
    const fakeTx = makeReversalFakeTx(calls, [[{ coins: 75 }], []]);

    const result = await reverseAward(fakeTx, {
      userId: 1n,
      eventType: "order_activated",
      source: { type: "order", id: "ord_1" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      walletLedger: {} as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      users: USERS as any,
    });

    // No order-row lock: award's source is opaque, so only the user lock runs.
    expect(calls).toEqual(["user-lock", "found", "not-found", "write"]);
    expect(result).toEqual({ coinsReturned: 75 });
  });

  it("is idempotent: a second call finds the existing reversal and writes nothing", async () => {
    const calls: string[] = [];
    const fakeTx = makeReversalFakeTx(calls, [[{ coins: 75 }], [{ id: 1 }]]);

    const result = await reverseAward(fakeTx, {
      userId: 1n,
      eventType: "order_activated",
      source: { type: "order", id: "ord_1" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      walletLedger: {} as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      users: USERS as any,
    });

    expect(calls).toEqual(["user-lock", "found", "found"]);
    expect(result).toEqual({ coinsReturned: 0 });
  });

  it("is a silent no-op when there is no award to reverse", async () => {
    const calls: string[] = [];
    const fakeTx = makeReversalFakeTx(calls, [[]]);

    const result = await reverseAward(fakeTx, {
      userId: 1n,
      eventType: "order_activated",
      source: { type: "order", id: "ord_1" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      walletLedger: {} as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      users: USERS as any,
    });

    expect(calls).toEqual(["user-lock", "not-found"]);
    expect(result).toEqual({ coinsReturned: 0 });
  });
});

/**
 * `reserveRedemption` writes the same row `commitRedemption` does (held, not
 * committed), so it must take the same locks in the same order and run the
 * same guards before writing. Structural, same rationale as above.
 */
describe("reserveRedemption lock/check ordering", () => {
  const reserveArgs = (calls: string[], over: { coins?: number; ttlMs?: number } = {}) => ({
    ...commitArgs(calls, { coins: over.coins }),
    ttlMs: over.ttlMs ?? 60_000,
  });

  it("locks user then order, dedupes, re-reads the balance, then writes", async () => {
    const calls: string[] = [];
    const fakeTx = makeFakeTx(calls);

    await reserveRedemption(fakeTx, reserveArgs(calls));

    expect(calls).toEqual(["user-lock", "order-lock", "dup-check", "balance-read", "write", "write"]);
  });

  it("refuses to hold coins the re-read balance cannot cover", async () => {
    const calls: string[] = [];
    const fakeTx = makeFakeTx(calls);

    await expect(reserveRedemption(fakeTx, reserveArgs(calls, { coins: 100_001 })))
      .rejects.toThrow(/insufficient coins to reserve redemption/i);
    expect(calls).not.toContain("write");
  });

  it("rejects a non-positive ttl before taking any lock", async () => {
    const calls: string[] = [];
    const fakeTx = makeFakeTx(calls);

    await expect(reserveRedemption(fakeTx, reserveArgs(calls, { ttlMs: 0 })))
      .rejects.toThrow(/ttl must be positive/i);
    expect(calls).toEqual([]);
  });
});

describe("settleReservation lock ordering", () => {
  it("locks user then order before reading the hold", async () => {
    const calls: string[] = [];
    const fakeTx = makeReversalFakeTx(calls, [[]]);

    const result = await settleReservation(fakeTx, {
      userId: 1n,
      orderId: 5n,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      walletLedger: LEDGER as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      orders: ORDERS as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      users: USERS as any,
    });

    expect(calls).toEqual(["user-lock", "order-lock", "not-found"]);
    expect(result).toEqual({ status: "none", coins: 0 });
  });
});
