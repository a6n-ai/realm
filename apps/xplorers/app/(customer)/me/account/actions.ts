"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@foundry/commons";
import { attempt } from "@/lib/actions/guard";
import { getSession } from "@/lib/auth/session";
import { friendsService } from "@/lib/services/friends.service";
import { usersService } from "@/lib/services/users.service";

export async function updateUsernameAction(raw: string): Promise<{ error?: string }> {
  const s = await getSession();
  if (!s || s.user.role !== Role.USER) return { error: "Sign in to set a username" };
  const r = await attempt(() => friendsService.setUsername(s.user.id, String(raw)));
  if ("error" in r) return r;
  revalidatePath("/me", "layout");
  return {};
}

export async function updateDisplayNameAction(raw: string): Promise<{ error?: string }> {
  const s = await getSession();
  if (!s || s.user.role !== Role.USER) return { error: "Sign in to update your name" };
  const name = String(raw).trim();
  if (!name) return { error: "Name is required" };
  if (name.length > 120) return { error: "Name is too long" };
  const r = await attempt(() => usersService.updateProfile(s.user.id, { name }));
  if ("error" in r) return r;
  revalidatePath("/me", "layout");
  revalidatePath("/me/account");
  return {};
}
