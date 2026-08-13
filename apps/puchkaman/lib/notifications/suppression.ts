import { and, eq, inArray, like } from "drizzle-orm";
import { normalizeAddress, suppress } from "@realm/notifications";
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

/**
 * STOP reaches everything: a carrier opt-out is not a marketing preference, and
 * continuing to send transactional SMS to a number that said STOP is a carrier
 * violation. Both channels are covered because Twilio delivers WhatsApp over
 * the same number.
 */
export async function suppressPhone(phone: string, reason: string): Promise<void> {
  for (const channel of ["sms", "whatsapp"] as const) {
    await suppress(db, notificationTables, { address: phone, channel, reason, scope: "all" });
  }
}

/**
 * START restores messaging. Deliberately scoped to keyword opt-outs by matching
 * the reason: a number blocked by a carrier as permanently undeliverable must
 * not be un-blocked by an inbound message.
 */
export async function unsuppressPhone(phone: string): Promise<void> {
  await db
    .delete(notificationTables.messageSuppression)
    .where(
      and(
        eq(notificationTables.messageSuppression.address, normalizeAddress(phone)),
        inArray(notificationTables.messageSuppression.channel, ["sms", "whatsapp"]),
        like(notificationTables.messageSuppression.reason, "sms STOP%"),
      ),
    );
}
