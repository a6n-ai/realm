import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { coinRate, users, walletLedger } from "@/db/schema";
import { listWalletBalances, walletBalanceStats } from "../wallet-balances.service";

const TAG = `wbal-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const email = (n: string) => `${TAG}-${n}@throwaway.local`;
const DAY = 86_400_000;
const now = Date.now();
const WIDE = { from: 0, to: now + DAY };
const SORT = { column: "balance", dir: "desc" } as const;
const PAGE = { page: 0, size: 50 };

let a: bigint; // 100 earned, 30 redeemed -> 70, plus an expired 40 hold
let b: bigint; // 20 earned, 20 redeemed -> 0
let rateId: bigint | undefined;

const entry = (userId: bigint, direction: "credit" | "debit", sourceType: string, coins: number, extra: Record<string, unknown> = {}) => ({
  userId, direction, sourceType, coins, sourceId: `${TAG}-${userId}-${Math.random()}`, eventType: direction === "credit" ? ("signup" as const) : null, ...extra,
});

async function cleanup() {
  const rows = await db.select({ id: users.id }).from(users).where(inArray(users.email, [email("a"), email("b")]));
  const ids = rows.map((r) => r.id);
  if (ids.length) {
    await db.delete(walletLedger).where(inArray(walletLedger.userId, ids));
    await db.delete(users).where(inArray(users.id, ids));
  }
  if (rateId) await db.delete(coinRate).where(eq(coinRate.id, rateId));
  rateId = undefined;
}

beforeEach(async () => {
  await cleanup();
  const [ua] = await db.insert(users).values({ email: email("a"), name: `${TAG} Alpha` }).returning();
  const [ub] = await db.insert(users).values({ email: email("b"), name: `${TAG} Beta` }).returning();
  a = ua.id;
  b = ub.id;
  const old = now - 90 * DAY;
  await db.insert(walletLedger).values([
    entry(a, "credit", "seed", 100, { createdAt: old }),
    entry(a, "debit", "redemption", 30, { createdAt: now - DAY }),
    entry(a, "debit", "redemption", 40, { reservedUntil: now - 60_000, createdAt: now - DAY }),
    entry(b, "credit", "seed", 20, { createdAt: old }),
    entry(b, "debit", "redemption", 20, { createdAt: old }),
  ]);
  const [r] = await db.insert(coinRate).values({ currency: "CAD", valuePerCoin: "0.2500" }).returning();
  rateId = r.id;
});

afterEach(cleanup);

const list = (o: Partial<Parameters<typeof listWalletBalances>[0]> = {}) =>
  listWalletBalances({ q: TAG, sort: SORT, page: PAGE, range: WIDE, ...o });

describe("listWalletBalances", () => {
  it("balance ignores an expired hold", async () => {
    const { rows } = await list();
    expect(rows.find((r) => r.userId === a)?.balance).toBe(70);
  });

  it("the date range limits earned and redeemed but not balance", async () => {
    const { rows } = await list({ range: { from: now - 2 * DAY, to: now + DAY } });
    const row = rows.find((r) => r.userId === a)!;
    expect(row.balance).toBe(70);
    expect(row.earned).toBe(0);
    expect(row.redeemed).toBe(30);
  });

  it("filters to wallets with a balance, or at zero", async () => {
    const has = await list({ filter: "has" });
    expect(has.rows.map((r) => r.userId)).toEqual([a]);
    const zero = await list({ filter: "zero" });
    expect(zero.rows.map((r) => r.userId)).toEqual([b]);
    expect(zero.total).toBe(1);
  });

  it("sorts by balance", async () => {
    expect((await list()).rows.map((r) => r.userId)).toEqual([a, b]);
    expect((await list({ sort: { column: "balance", dir: "asc" } })).rows.map((r) => r.userId)).toEqual([b, a]);
  });

  it("values coins at the current coin rate", async () => {
    const { rows } = await list();
    expect(rows.find((r) => r.userId === a)?.value).toBe(17.5);
  });
});

describe("balances as of the range end", () => {
  const bal = async (to: number) => (await list({ range: { from: 0, to } })).rows.find((r) => r.userId === a)?.balance;

  it("excludes rows created after range.to", async () => {
    expect(await bal(now - 2 * DAY)).toBe(100); // both debits are newer
    expect(await bal(now)).toBe(70);
  });

  it("a hold expiring before range.to is excluded, but counts for an earlier end", async () => {
    // hold created now-DAY, lapsed now-1min: live at now-2h, lapsed at now
    expect(await bal(now - 2 * 3_600_000)).toBe(30);
    expect(await bal(now)).toBe(70);
  });

  it("a future range end is clamped to now (live holds stay held)", async () => {
    expect(await bal(now + 30 * DAY)).toBe(70);
  });
});

describe("walletBalanceStats", () => {
  it("range moves earned/redeemed; balance figures follow the range end", async () => {
    const none = await walletBalanceStats({ from: now + DAY, to: now + 2 * DAY });
    const wide = await walletBalanceStats(WIDE);
    expect(wide.earned - none.earned).toBe(120);
    expect(wide.redeemed - none.redeemed).toBe(50);
    expect(wide.outstanding).toBe(none.outstanding); // both clamp to now
  });
});
