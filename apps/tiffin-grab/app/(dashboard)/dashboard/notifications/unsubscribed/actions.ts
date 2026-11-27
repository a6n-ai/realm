"use server";

import { ValidationError } from "@foundry/commons";
import { suppressManually } from "@relay/engine";
import { createLogger } from "@foundry/commons/logger";
import { and, eq, sql } from "drizzle-orm";
import type { ActionResult } from "@/lib/actions/action-result";
import { staffAction } from "@/lib/actions/staff-action";
import { db } from "@/db/client";
import { messageSuppression } from "@/db/schema";
import { clearableKind } from "@/lib/notifications/logs-query";
import { notificationTables } from "@/lib/notifications/tables";
import { signalOutbox } from "@/lib/notifications/outbox-signal";
import { pushBlocks, queueBlock } from "@/lib/relay/blocks";
import { relayRpc } from "@/lib/relay/client";
import { emailViaRelay } from "@/lib/runtime/env";

const OPTS = { guard: { notification: ["write"] }, revalidate: ["/dashboard/notifications/unsubscribed"] } as const;
const NOT_CLEARABLE = "This block can't be cleared here. An opt-out or complaint can only be reversed by the recipient.";
const RELAY_UNAVAILABLE = "We could not update the block list right now. Please try again in a few minutes.";
const log = createLogger("unsubscribed");

// SQL twins of suppressionKind, so each delete judges the reason the row holds as it is removed.
const { reason: stored } = messageSuppression;
const bounced = sql`(${stored} ilike '%bounce%' or ${stored} ilike '%undeliverable%')`;
const recipients = sql`(${stored} ilike '%unsubscribe%' or ${stored} ilike '%stop%' or ${stored} ilike '%complaint%')`;

async function clearLocal(publicId: string) {
  const deleted = await db
    .delete(messageSuppression)
    .where(and(eq(messageSuppression.publicId, publicId), sql`not ${recipients} and (${bounced} or ${stored} = 'manual')`))
    .returning({ id: messageSuppression.id });
  if (!deleted.length) throw new ValidationError("This block is gone or can't be cleared here. Reload the page.");
}

async function clearOnRelay(email: string, kind: "bounce" | "manual") {
  try {
    // A block still queued would put back what is removed here.
    if ((await pushBlocks()).pending) throw new Error("blocks still queued");
    await relayRpc().removeSuppression({ email, reason: kind });
  } catch {
    // The error is neither logged nor returned: it can carry the address.
    log.warn({ reason: kind }, "relay block removal failed");
    throw new ValidationError(RELAY_UNAVAILABLE);
  }
  // "manual" is what toRelayReason calls every reason it does not recognise.
  await db.delete(messageSuppression).where(
    and(
      eq(messageSuppression.channel, "email"),
      sql`lower(trim(${messageSuppression.address})) = ${email}`,
      sql`not ${recipients} and ${kind === "bounce" ? bounced : sql`not ${bounced}`}`,
    ),
  );
}

export async function clearSuppressionAction(publicId: string, address: string, reason: string): Promise<ActionResult> {
  return staffAction(OPTS, async () => {
    const kind = clearableKind(reason);
    if (!kind) throw new ValidationError(NOT_CLEARABLE);
    if (!emailViaRelay()) return clearLocal(publicId);
    await clearOnRelay(address.trim().toLowerCase(), kind);
  });
}

export async function suppressManuallyAction(address: string): Promise<ActionResult> {
  return staffAction(OPTS, async () => {
    await db.transaction(async (tx) => {
      const result = await suppressManually(tx as unknown as typeof db, notificationTables, { address, channel: "email" });
      if ("error" in result) throw new ValidationError(result.error);
      await queueBlock(tx, { email: address, reason: "manual", stream: "marketing", source: "admin", createdAt: Date.now() });
    });
    await signalOutbox();
  });
}
