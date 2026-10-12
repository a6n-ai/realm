"use server";

import { revalidatePath } from "next/cache";
import { clearSuppression, suppressManually } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { notificationTables } from "@/lib/notifications/tables";

const PATH = "/dashboard/notifications/unsubscribed";

// Return the message instead of throwing, so production shows the real reason.
export async function clearSuppressionAction(publicId: string): Promise<{ error?: string }> {
  await requireAdmin();
  const result = await clearSuppression(db, notificationTables, publicId);
  if ("error" in result) return { error: result.error };
  revalidatePath(PATH);
  return {};
}

export async function suppressManuallyAction(address: string, channel: "email" | "sms"): Promise<{ error?: string }> {
  await requireAdmin();
  if (channel !== "email" && channel !== "sms") return { error: "Pick email or SMS" };
  const result = await suppressManually(db, notificationTables, { address: String(address), channel });
  if ("error" in result) return { error: result.error };
  revalidatePath(PATH);
  return {};
}
