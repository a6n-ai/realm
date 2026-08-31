import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { NotificationTables } from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

const FEED_LIMIT = 30;

export interface FeedItem {
  publicId: string;
  event: string | null;
  title: string;
  body: string;
  href: string | null;
  readAt: number | null;
  createdAt: number;
}

export async function getFeed(
  db: Db,
  tables: NotificationTables,
  userId: bigint,
): Promise<{ items: FeedItem[]; unread: number }> {
  const n = tables.notifications;
  const items = await db
    .select({
      publicId: n.publicId, event: n.event, title: n.title, body: n.body,
      href: n.href, readAt: n.readAt, createdAt: n.createdAt,
    })
    .from(n)
    .where(eq(n.userId, userId))
    .orderBy(desc(n.createdAt))
    .limit(FEED_LIMIT);

  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(n)
    .where(and(eq(n.userId, userId), isNull(n.readAt)));

  return { items: items as FeedItem[], unread: count };
}

/** Mark the given notifications read (or all unread when no ids). Returns count. */
export async function markRead(
  db: Db,
  tables: NotificationTables,
  userId: bigint,
  publicIds?: string[],
): Promise<number> {
  const n = tables.notifications;
  const onlyUnread = and(eq(n.userId, userId), isNull(n.readAt));
  const where =
    publicIds && publicIds.length > 0
      ? and(onlyUnread, sql`${n.publicId} = any(${publicIds})`)
      : onlyUnread;
  const rows = await db.update(n).set({ readAt: Date.now() }).where(where).returning({ id: n.id });
  return rows.length;
}
