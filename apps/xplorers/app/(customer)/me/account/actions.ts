"use server";

import { revalidatePath } from "next/cache";
import { Role, ValidationError } from "@foundry/commons";
import { getSession } from "@/lib/auth/session";
import { friendsService } from "@/lib/services/friends.service";

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
