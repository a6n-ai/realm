"use server";

import { revalidatePath } from "next/cache";
import { AuthError, ValidationError } from "@tiffin/commons";
import { getSession } from "@/lib/auth/session";
import { usersService } from "@/lib/services/users.service";

export async function updateMyContact(input: { phone?: string; email?: string }) {
  const session = await getSession();
  if (!session?.user?.id) throw new AuthError();
  await usersService.updateContact(session.user.id, input);
  revalidatePath("/dashboard/account");
}

export async function updateMyAddress(input: {
  addressLine?: string;
  addressUnit?: string;
  city?: string;
  postalCode?: string;
  province?: string;
}) {
  const session = await getSession();
  if (!session?.user?.id) throw new AuthError();
  await usersService.updateAddress(session.user.id, input);
  revalidatePath("/dashboard/account");
}

export async function updateMyPreferences(input: {
  dietaryNotes?: string;
  allergens?: string[];
  deliveryNotes?: string;
  notifyEmail?: boolean;
  notifySms?: boolean;
}) {
  const session = await getSession();
  if (!session?.user?.id) throw new AuthError();
  await usersService.updatePreferences(session.user.id, input);
  revalidatePath("/dashboard/account");
}

export async function updateMyName(name: string) {
  const session = await getSession();
  if (!session?.user?.id) throw new AuthError();
  await usersService.updateProfile(session.user.id, { name });
  revalidatePath("/dashboard/account");
  return { ok: true };
}

export async function setMyPin(currentPassword: string, newPin: string): Promise<{ ok: boolean; message?: string }> {
  const session = await getSession();
  if (!session?.user?.id) throw new AuthError();
  try {
    await usersService.setPin(session.user.id, currentPassword, newPin);
    revalidatePath("/dashboard/account");
    return { ok: true };
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, message: e.message };
    throw e;
  }
}

export async function removeMyPin(currentPassword: string): Promise<{ ok: boolean; message?: string }> {
  const session = await getSession();
  if (!session?.user?.id) throw new AuthError();
  try {
    await usersService.removePin(session.user.id, currentPassword);
    revalidatePath("/dashboard/account");
    return { ok: true };
  } catch (e) {
    if (e instanceof ValidationError) return { ok: false, message: e.message };
    throw e;
  }
}
