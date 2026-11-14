"use server";

import { handleResubscribe } from "@relay/engine";
import { db } from "@/db/client";
import { unsubscribeSecret } from "@/lib/runtime/env";
import { notificationTables } from "@/lib/notifications/tables";

export async function confirmResubscribe(address: string, token: string): Promise<boolean> {
  const secret = unsubscribeSecret();
  if (!secret) return false;
  return handleResubscribe(db, notificationTables, { address, token, secret });
}
