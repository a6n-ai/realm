import { suppress } from "@realm/notifications";
import { createLogger } from "@realm/commons/logger";
import { db } from "@/db/client";
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
  await suppress(db, notificationTables, { address: email, channel: "email", reason, scope: "all" });
  log.info(`suppressed email channel for a bounced/complained address: ${reason}`);
  return true;
}
