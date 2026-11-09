"use server";

import { requireAccountUser } from "./current-user";
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
  return {};
}
