"use server";

import { runAction, type ActionResult } from "@/lib/actions/action-result";
import { requireCustomer } from "@/lib/account/customer";
import { requireAccountUser } from "@/lib/account/current-user";
import { db } from "@/db/client";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import { revalidateAccount } from "@/lib/account/revalidate";
import { usersService } from "@/lib/services/users.service";

// Phone only. Your own email changes through the OTP change-email flow
// (Security), which proves both the old and the new address — accepting email
// here let any signed-in session swap the login identity with no code at all.
export async function updateMyContact(input: { phone: string }): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireCustomer();
    await usersService.updateContact(user.id, { phone: input.phone });
    revalidateAccount();
  });
}

export async function updateMyPreferences(input: {
  dietaryNotes?: string;
  allergens?: string[];
  deliveryNotes?: string;
  notifyEmail?: boolean;
  notifySms?: boolean;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireCustomer();
    await usersService.updatePreferences(user.id, input);
    revalidateAccount();
  });
}

export async function updateMyProfile(input: { name?: string; username?: string }): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireCustomer();
    await usersService.updateProfile(user.id, input);
    revalidateAccount();
  });
}

// PinForm reads { ok, message }: a refusal reaches it as a message, never a throw.
const pinResult = (r: ActionResult): { ok: boolean; message?: string } => ("error" in r ? { ok: false, message: r.error } : { ok: true });

export async function setMyPin(currentPassword: string, newPin: string): Promise<{ ok: boolean; message?: string }> {
  return pinResult(
    await runAction(async () => {
      const user = await requireCustomer();
      await usersService.setPin(user.id, currentPassword, newPin);
      revalidateAccount();
    }),
  );
}

export async function removeMyPin(currentPassword: string): Promise<{ ok: boolean; message?: string }> {
  return pinResult(
    await runAction(async () => {
      const user = await requireCustomer();
      await usersService.removePin(user.id, currentPassword);
      revalidateAccount();
    }),
  );
}

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
