"use server";

import { runAction, type ActionResult } from "@/lib/actions/action-result";
import { requireCustomer } from "@/lib/account/customer";
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
