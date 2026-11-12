import { getFeed as pkgGetFeed, markRead as pkgMarkRead, type FeedItem } from "@relay/engine";
import { db } from "@/db/client";
import { notificationTables } from "./tables";

export type { FeedItem };

export const getFeed = (userId: bigint) => pkgGetFeed(db, notificationTables, userId);
export const markRead = (userId: bigint, publicIds?: string[]) =>
  pkgMarkRead(db, notificationTables, userId, publicIds);
