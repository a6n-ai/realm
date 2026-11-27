import { normalizeAddress, suppress, suppressionKind } from "@relay/engine";
import { createLogger } from "@foundry/commons/logger";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { messageSuppression } from "@/db/schema";
import { queueBlock, toRelayReason } from "@/lib/relay/blocks";
import { signalOutbox } from "./outbox-signal";
import { notificationTables } from "./tables";

const log = createLogger("ses-suppression");

/**
 * Block the email channel for an address in response to an SES hard bounce or
 * complaint. Keyed on the address rather than a user: the bounce payload has no
 * user id, and an address with no account still must not be retried.
 *
 * Scope "all": a dead or hostile address must not receive receipts either.
 */
export async function suppressEmailRecipient(email: string, reason: string): Promise<boolean> {
  const address = normalizeAddress(email);
  await db.transaction(async (tx) => {
    // Two events for one address can arrive at once; the lock stops a bounce overwriting a complaint it did not see.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${address}))`);
    const [held] = await tx
      .select({ reason: messageSuppression.reason })
      .from(messageSuppression)
      .where(and(eq(messageSuppression.address, address), eq(messageSuppression.channel, "email"), eq(messageSuppression.scope, "all")));
    if (!(held && suppressionKind(held.reason) === "complaint" && suppressionKind(reason) === "bounce")) {
      await suppress(tx as unknown as typeof db, notificationTables, { address, channel: "email", reason, scope: "all" });
    }
    await queueBlock(tx, { email: address, reason: toRelayReason(reason), stream: null, source: "ses", createdAt: Date.now() });
  });
  await signalOutbox();
  log.info(`suppressed email channel for a bounced/complained address: ${reason}`);
  return true;
}
