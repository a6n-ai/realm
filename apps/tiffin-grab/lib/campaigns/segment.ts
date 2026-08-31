import { and, eq, sql } from "drizzle-orm";
import type { AudienceDef } from "@relay/engine";
import { db } from "@/db/client";
import { orders, users } from "@/db/schema";

type Segment = NonNullable<AudienceDef["segment"]>;

/**
 * Turn a segment definition into customer user ids.
 *
 * Lives in the app because the package cannot know what an order is. Aggregates
 * over `orders` grouped by owner; orders with no owner (pre-backfill) simply do
 * not participate.
 */
export async function resolveSegment(segment: Segment): Promise<bigint[]> {
  const having = [];
  if (segment.minOrderCount) having.push(sql`count(*) >= ${segment.minOrderCount}`);
  if (segment.minTotalSpend) having.push(sql`sum(${orders.total}) >= ${segment.minTotalSpend}`);
  if (segment.lastOrderAfter) having.push(sql`max(${orders.createdAt}) >= ${segment.lastOrderAfter}`);
  if (segment.lastOrderBefore) having.push(sql`max(${orders.createdAt}) <= ${segment.lastOrderBefore}`);

  // Marketing SMS requires a verified number (Plan D's isSmsDeliverable).
  // Excluding here is one query; excluding at send time would already have
  // created the outbox row.
  const filters = [sql`${orders.userId} is not null`];
  if (segment.requireVerifiedPhone) filters.push(eq(users.phoneVerified, true));

  const rows = await db
    .select({ userId: orders.userId })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .where(and(...filters))
    .groupBy(orders.userId)
    .having(having.length ? and(...having) : sql`true`);

  return rows.map((r) => r.userId as bigint);
}
