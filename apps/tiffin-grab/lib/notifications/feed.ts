import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getSession } from "@/lib/auth/session";
import { db } from "@/db/client";
import { notifications, users } from "@/db/schema";

const FEED_LIMIT = 30;

export interface FeedItem {
  publicId: string;
  event: string;
  title: string;
  body: string;
  href: string | null;
  readAt: number | null;
  createdAt: number;
}

/** Resolve the logged-in user's internal bigint id, or null when no session. */
export async function currentUserId(): Promise<bigint | null> {
  const publicId = (await getSession())?.user?.id;
  if (!publicId) return null;
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId));
  return row?.id ?? null;
}

export async function getFeed(userId: bigint): Promise<{ items: FeedItem[]; unread: number }> {
  const items = await db
    .select({
      publicId: notifications.publicId,
      event: notifications.event,
      title: notifications.title,
      body: notifications.body,
      href: notifications.href,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(FEED_LIMIT);

  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));

  return { items, unread: count };
}

/** Mark the given notifications read (or all unread when no ids). Returns count. */
export async function markRead(userId: bigint, publicIds?: string[]): Promise<number> {
  const onlyUnread = and(eq(notifications.userId, userId), isNull(notifications.readAt));
  const where =
    publicIds && publicIds.length > 0
      ? and(onlyUnread, sql`${notifications.publicId} = any(${publicIds})`)
      : onlyUnread;
  const rows = await db
    .update(notifications)
    .set({ readAt: Date.now() })
    .where(where)
    .returning({ id: notifications.id });
  return rows.length;
}
