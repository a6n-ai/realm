"use server";

import { revalidatePath } from "next/cache";
import { currentUserId } from "@/lib/services/session-service";
import { attachReferral, type AttachResult } from "@/lib/services/referrals.service";

const MESSAGE: Record<Exclude<AttachResult, "attached">, string> = {
  unknown_code: "That code isn't valid. Check it with your friend.",
  self: "That's your own code. Share it with friends instead.",
  not_eligible: "Codes only work before your first paid order.",
  already: "You already joined with a friend's code.",
};

/** Refer tab, Google sign-ups: the signed-in owner enters a friend's code themselves. */
export async function enterReferralCode(raw: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await currentUserId();
  if (userId == null) return { ok: false, error: "Sign in again to add a code." };
  const result = await attachReferral(userId, raw ?? "");
  if (result !== "attached") return { ok: false, error: MESSAGE[result] };
  revalidatePath("/me/refer");
  return { ok: true };
}
