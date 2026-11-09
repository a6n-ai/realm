"use server";

import { requireAccountUser } from "./current-user";
import { db } from "@/db/client";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import { usersService } from "@/lib/services/users.service";

/**
 * Self-service account deletion: soft-delete (status -> deleted, contact
 * anonymized, sessions revoked). Requires the account password. Never hard-
 * deletes — business history is preserved.
 */
export async function deleteMyAccount(input: { password: string }): Promise<{ error?: string }> {
  const { user } = await requireAccountUser();
  const ok = await usersService.verifyAccountPassword(user.publicId, input.password);
  if (!ok) return { error: "Incorrect password" };
  await usersService.softDelete(user.publicId);
  // softDelete anonymizes the address, so the notice carries the one the customer had; the engine stores it on the row.
  await db.transaction((tx) => enqueueNotification(tx, {
    event: "account_deletion_confirm",
    recipientId: user.id,
    recipientEmail: user.email,
    title: "Your account was deleted",
    body: "Your Tiffin Grab account has been deleted.",
    dedupeKey: `account_deletion_confirm:${user.publicId}`,
  }));
  return {};
}
