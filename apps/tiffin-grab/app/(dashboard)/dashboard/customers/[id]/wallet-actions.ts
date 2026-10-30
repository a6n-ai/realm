"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { ValidationError } from "@foundry/commons";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { currentUserId } from "@/lib/services/session-service";
import { walletService } from "@/lib/services/wallet.service";
import { staffAttachReferral } from "@/lib/services/referrals.service";

export async function adjustCustomerCoinsAction(
  customerPublicId: string,
  input: { coins: number; memo: string },
): Promise<{ error?: string }> {
  await requireAdmin();
  try {
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, customerPublicId)).limit(1);
    if (!user) throw new ValidationError("Customer not found.");
    await walletService.adjust({ userId: user.id, coins: input.coins, memo: input.memo, actorId: await currentUserId() });
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/dashboard/customers/${customerPublicId}`, "layout");
  return {};
}

const ATTACH_ERRORS: Record<string, string> = {
  unknown_code: "No active customer has that code.",
  self: "That is this customer's own code.",
  already: "This customer already has a referrer.",
  not_eligible: "This customer can't be referred (staff account, or they referred that person).",
  repeat_customer: "Only a customer on their first paid order can be referred.",
};

/** Adds the referral code a customer forgot at checkout; pays both sides now if their first order is paid. */
export async function attachReferralCodeAction(customerPublicId: string, code: string): Promise<{ error?: string; friend?: number; referrer?: number; skipped?: string }> {
  await requireAdmin();
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, customerPublicId)).limit(1);
  if (!user) return { error: "Customer not found." };
  const res = await staffAttachReferral(user.id, code, await currentUserId());
  if (res.result !== "attached") return { error: ATTACH_ERRORS[res.result] };
  revalidatePath(`/dashboard/customers/${customerPublicId}`, "layout");
  return { friend: res.friend, referrer: res.referrer, skipped: res.skipped };
}
