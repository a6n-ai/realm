"use server";

import { buildResubscribeUrl } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { runAction, type ActionResult } from "@/app/(customer)/me/action-result";
import { ValidationError } from "@foundry/commons";
import { createLogger } from "@foundry/commons/logger";
import { getSession } from "@/lib/auth/session";

const log = createLogger("resubscribe");

/** Signed link an admin sends to someone who unsubscribed and wants mail again. */
export async function resubscribeLink(address: string): Promise<ActionResult<{ url: string }>> {
  return runAction(async () => {
    await requireAdmin();
    const secret = process.env.UNSUBSCRIBE_SECRET;
    const base = process.env.CAMPAIGN_BASE_URL ?? process.env.SITE_URL;
    if (!secret || !base) throw new ValidationError("UNSUBSCRIBE_SECRET and SITE_URL must be set");
    // Whoever holds the link can confirm it, staff included — so record who issued it.
    log.info({ actorId: (await getSession())?.user?.id ?? null, domain: address.split("@")[1] ?? null }, "re-subscribe link issued");
    return { url: buildResubscribeUrl(base, secret, address) };
  });
}
