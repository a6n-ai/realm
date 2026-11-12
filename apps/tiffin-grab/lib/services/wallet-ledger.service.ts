import { pageOffset } from "@foundry/design-system/filters/parse-filter-state";
import { and, eq, gte, ilike, like, lte, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { earnedCoinsSql, spentCoinsSql, unexpired } from "@foundry/wallet";
import { walletLedger, users, orders, customerGroupActions, customerGroups } from "@/db/schema";
import { grantActionId, grantGroupName, grantGroupPublicId, legacyGroup } from "@/lib/services/customer-groups.service";
import { type SortState } from "@foundry/design-system/list-sort";
import { pageOrder } from "@foundry/database";
import { requestNow } from "@/lib/dates/request-now";

const SORT_COL = {
  time: walletLedger.createdAt,
  user: users.email,
  event: walletLedger.eventType,
  source: walletLedger.sourceType,
  coins: walletLedger.coins,
  order: orders.publicId,
  memo: walletLedger.memo,
} as const;

export type WalletSortColumn = keyof typeof SORT_COL;
export async function walletLedgerStats(range: { from: number; to: number } = { from: 0, to: Number.MAX_SAFE_INTEGER }) {
  const [agg] = await db
    .select({
      earned: earnedCoinsSql(walletLedger),
      spent: spentCoinsSql(walletLedger),
      entries: sql<number>`cast(count(*) as int)`,
      wallets: sql<number>`cast(count(distinct ${walletLedger.userId}) as int)`,
    })
    // Lapsed holds never spent anything, so they are not earned, not
    // spent, and not entries — same rule walletService.balance() applies.
    .from(walletLedger)
    .where(and(unexpired(walletLedger, requestNow()), gte(walletLedger.createdAt, range.from), lte(walletLedger.createdAt, range.to)));

  return { agg };
}

/**
 * Exported for its test, same reason as walletLedgerStats: a lapsed hold must
 * not show as a debit here while the balance ignores it (it reads as a second
 * debit next to the re-collect row).
 */
const actor = alias(users, "actor");

export async function walletLedgerRows({ q, userId, sourceType, direction, range, sort, page }: {
  q?: string;
  /** Narrows to one customer's wallet (the customer Wallet tab). */
  userId?: bigint;
  /** Narrows to entries created inside the window (epoch-ms, inclusive). */
  range?: { from: number; to: number };
  /** Narrows to one source, e.g. the Give coins history (`manual_broadcast`). */
  sourceType?: string;
  direction?: "credit" | "debit";
  sort: SortState<WalletSortColumn>;
  page: { page: number; size: number };
}) {
  const search: SQL | undefined = q
    ? or(
        ilike(walletLedger.memo, `%${q}%`),
        ilike(users.email, `%${q}%`),
        sql`${walletLedger.eventType}::text ilike ${`%${q}%`}`,
        sql`${walletLedger.sourceType}::text ilike ${`%${q}%`}`,
        ilike(orders.publicId, `%${q}%`),
      )
    : undefined;
  const where = and(
    unexpired(walletLedger, requestNow()),
    search,
    userId ? eq(walletLedger.userId, userId) : undefined,
    sourceType ? eq(walletLedger.sourceType, sourceType) : undefined,
    direction ? eq(walletLedger.direction, direction) : undefined,
    range ? and(gte(walletLedger.createdAt, range.from), lte(walletLedger.createdAt, range.to)) : undefined,
  );

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        publicId: walletLedger.publicId,
        createdAt: walletLedger.createdAt,
        direction: walletLedger.direction,
        eventType: walletLedger.eventType,
        sourceType: walletLedger.sourceType,
        coins: walletLedger.coins,
        memo: walletLedger.memo,
        email: users.email,
        userPublicId: users.publicId,
        groupName: grantGroupName,
        groupPublicId: grantGroupPublicId,
        orderPublicId: orders.publicId,
        actorName: actor.name,
      })
      .from(walletLedger)
      .leftJoin(users, eq(users.id, walletLedger.userId))
      .leftJoin(orders, eq(orders.id, walletLedger.orderId))
      .leftJoin(actor, eq(actor.id, walletLedger.createdBy))
      .leftJoin(customerGroupActions, and(like(walletLedger.sourceId, "grant:%"), eq(customerGroupActions.publicId, grantActionId)))
      .leftJoin(customerGroups, eq(customerGroups.id, customerGroupActions.groupId))
      .leftJoin(legacyGroup, and(like(walletLedger.sourceId, "grant:%"), eq(legacyGroup.publicId, grantActionId)))
      .where(where)
      .orderBy(...pageOrder(sort.dir, SORT_COL[sort.column], walletLedger.id))
      .limit(page.size)
      .offset(pageOffset(page.page, page.size)),
    db
      .select({ total: sql<number>`cast(count(*) as int)` })
      .from(walletLedger)
      .leftJoin(users, eq(users.id, walletLedger.userId))
      .leftJoin(orders, eq(orders.id, walletLedger.orderId))
      .leftJoin(customerGroupActions, and(like(walletLedger.sourceId, "grant:%"), eq(customerGroupActions.publicId, grantActionId)))
      .leftJoin(customerGroups, eq(customerGroups.id, customerGroupActions.groupId))
      .leftJoin(legacyGroup, and(like(walletLedger.sourceId, "grant:%"), eq(legacyGroup.publicId, grantActionId)))
      .where(where),
  ]);
  return { rows, total };
}
