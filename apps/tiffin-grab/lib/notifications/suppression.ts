import { eq, sql } from "drizzle-orm";
import { createLogger } from "@realm/commons/logger";
import { db } from "@/db/client";
import { notificationPrefs, users } from "@/db/schema";

const log = createLogger("ses-suppression");

/**
 * Force-suppress the email channel for the user who owns `email`, in response
 * to an SES hard bounce or complaint. The existing enqueue path
 * (policy.ts resolveChannels: `enabled && !suppressed`) then skips email for
 * this user automatically — no send-path change needed.
 *
 * Matches by address case-insensitively (better-auth lowercases on write, but
 * the bounce payload echoes the envelope as sent). Unknown address → no-op.
 * Returns true if a user was found and suppressed.
 */
export async function suppressEmailRecipient(email: string, reason: string): Promise<boolean> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(sql`lower(${users.email})`, email.toLowerCase()))
    .limit(1);

  if (!user) {
    log.warn(`no user for bounced/complained address; nothing to suppress`);
    return false;
  }

  await db
    .insert(notificationPrefs)
    .values({ userId: user.id, channel: "email", suppressed: true, suppressedReason: reason })
    .onConflictDoUpdate({
      target: [notificationPrefs.userId, notificationPrefs.channel],
      set: { suppressed: true, suppressedReason: reason },
    });

  log.info(`suppressed email channel for user ${user.id}: ${reason}`);
  return true;
}
