"use server";

import { createLogger } from "@foundry/commons/logger";
import { handleResubscribe, verifyResubscribeToken } from "@relay/engine";
import { db } from "@/db/client";
import { campaignConfig } from "@/lib/notifications/campaign-config";
import { notificationTables } from "@/lib/notifications/tables";
import { pushBlocks } from "@/lib/relay/blocks";
import { relayRpc } from "@/lib/relay/client";
import { emailViaRelay, notifyFrom, unsubscribeSecret } from "@/lib/runtime/env";

const log = createLogger("resubscribe");

export async function confirmResubscribe(address: string, token: string): Promise<"done" | "invalid" | "unavailable"> {
  const secret = unsubscribeSecret();
  if (!secret || !address || !token || !verifyResubscribeToken(secret, address, token)) return "invalid";
  // Relay holds email blocks only.
  if (emailViaRelay() && address.includes("@")) {
    try {
      // A block still queued would put back what Relay removes here.
      if ((await pushBlocks()).pending) return "unavailable";
      const from = (await campaignConfig())?.sender.email ?? notifyFrom().email;
      await relayRpc().resubscribe({ email: address.trim().toLowerCase(), from });
    } catch {
      // The error is not logged: it can carry the address.
      log.warn("relay re-subscribe failed");
      return "unavailable";
    }
  }
  return (await handleResubscribe(db, notificationTables, { address, token, secret })) ? "done" : "invalid";
}
