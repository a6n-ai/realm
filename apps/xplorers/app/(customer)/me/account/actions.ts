"use server";

import { revalidatePath } from "next/cache";
import { Role, ValidationError } from "@foundry/commons";
import { getSession } from "@/lib/auth/session";
import { friendsService } from "@/lib/services/friends.service";
import { usersService } from "@/lib/services/users.service";

export async function updateUsernameAction(raw: string): Promise<{ error?: string }> {
  const s = await getSession();
  if (!s || s.user.role !== Role.USER) return { error: "Sign in to set a username" };
  try {
    await friendsService.setUsername(s.user.id, String(raw));
  } catch (e) {
    if (e instanceof ValidationError) return { error: e.message };
    throw e;
  }
  revalidatePath("/me", "layout");
  return {};
}

export async function updateDisplayNameAction(raw: string): Promise<{ error?: string }> {
  const s = await getSession();
  if (!s || s.user.role !== Role.USER) return { error: "Sign in to update your name" };
  const name = String(raw).trim();
  if (!name) return { error: "Name is required" };
  if (name.length > 120) return { error: "Name is too long" };
  try {
    await usersService.updateProfile(s.user.id, { name });
  } catch (e) {
    if (e instanceof ValidationError) return { error: e.message };
    throw e;
  }
  revalidatePath("/me", "layout");
  revalidatePath("/me/account");
  return {};
}
