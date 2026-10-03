"use server";

import { buildResubscribeUrl } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { runAction, type ActionResult } from "@/app/(customer)/me/action-result";
import { ValidationError } from "@foundry/commons";

/** Signed link an admin sends to someone who unsubscribed and wants mail again. */
export async function resubscribeLink(address: string): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    await requireAdmin();
    const secret = process.env.UNSUBSCRIBE_SECRET;
    const base = process.env.CAMPAIGN_BASE_URL ?? process.env.SITE_URL;
    if (!secret || !base) throw new ValidationError("UNSUBSCRIBE_SECRET and SITE_URL must be set");
    return { url: buildResubscribeUrl(base, secret, address) };
  });
}
