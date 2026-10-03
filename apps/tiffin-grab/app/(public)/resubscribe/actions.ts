"use server";

import { handleResubscribe } from "@relay/engine";
import { db } from "@/db/client";
import { notificationTables } from "@/lib/notifications/tables";

export async function confirmResubscribe(address: string, token: string): Promise<boolean> {
  const secret = process.env.UNSUBSCRIBE_SECRET;
  if (!secret) return false;
  return handleResubscribe(db, notificationTables, { address, token, secret });
}
