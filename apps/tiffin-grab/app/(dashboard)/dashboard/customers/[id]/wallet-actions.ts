"use server";

import { ValidationError } from "@foundry/commons";
import type { ActionResult } from "@/lib/actions/action-result";
import { staffAction } from "@/lib/actions/staff-action";
import { currentUserId } from "@/lib/services/session-service";
import { userIdByPublicId } from "@/lib/identity/user-ids";
import { walletService } from "@/lib/wallet/wallet.service";
import { staffAttachReferral } from "@/lib/referrals/referrals.service";

export async function adjustCustomerCoinsAction(
  customerPublicId: string,
  input: { coins: number; memo: string },
): Promise<ActionResult> {
  return staffAction({ guard: "admin", revalidate: [[`/dashboard/customers/${customerPublicId}`, "layout"]] }, async () => {
    const userId = await userIdByPublicId(customerPublicId);
    if (!userId) throw new ValidationError("Customer not found.");
    await walletService.adjust({ userId, coins: input.coins, memo: input.memo, actorId: await currentUserId() });
  });
}

const ATTACH_ERRORS: Record<string, string> = {
  unknown_code: "No active customer has that code.",
  self: "That is this customer's own code.",
  already: "This customer already has a referrer.",
  not_eligible: "This customer can't be referred (staff account, or they referred that person).",
  repeat_customer: "Only a customer on their first paid order can be referred.",
};

/** Adds the referral code a customer forgot at checkout; pays both sides now if their first order is paid. */
export async function attachReferralCodeAction(
  customerPublicId: string,
  code: string,
): Promise<ActionResult<{ friend?: number; referrer?: number; skipped?: string }>> {
  return staffAction({ guard: "admin", revalidate: [[`/dashboard/customers/${customerPublicId}`, "layout"]] }, async () => {
    const userId = await userIdByPublicId(customerPublicId);
    if (!userId) throw new ValidationError("Customer not found.");
    const res = await staffAttachReferral(userId, code, await currentUserId());
    if (res.result !== "attached") throw new ValidationError(ATTACH_ERRORS[res.result]);
    return { friend: res.friend, referrer: res.referrer, skipped: res.skipped };
  });
}
