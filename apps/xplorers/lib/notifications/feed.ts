import { eq } from "drizzle-orm";
import { getFeed as pkgGetFeed, markRead as pkgMarkRead, type FeedItem } from "@relay/engine";
import { getSession } from "@/lib/auth/session";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { notificationTables } from "./tables";

export type { FeedItem };

/** Resolve the logged-in user's internal bigint id, or null when no session. */
export async function currentUserId(): Promise<bigint | null> {
  const publicId = (await getSession())?.user?.id;
  if (!publicId) return null;
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, publicId));
  return row?.id ?? null;
}

export const getFeed = (userId: bigint) => pkgGetFeed(db, notificationTables, userId);
export const markRead = (userId: bigint, publicIds?: string[]) =>
  pkgMarkRead(db, notificationTables, userId, publicIds);
