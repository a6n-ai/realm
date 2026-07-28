import { and, eq } from "drizzle-orm";
import { isLegacyHash } from "@realm/auth";
import { createLogger } from "@realm/commons/logger";
import { db } from "@/db/client";
import { account } from "@/db/schema";
import { hashPassword, verifyPassword } from "./password";

const log = createLogger("password-upgrade");

/**
 * Re-hash a surviving bcrypt credential with scrypt, on successful sign-in.
 *
 * A hash cannot be converted without the plaintext, and better-auth's
 * `password.verify` callback gets no database handle — so the sign-in hook is
 * the one place with both. Every legacy account upgrades itself the next time
 * its owner logs in; once none are left, this and the bcrypt branch in
 * @realm/auth can go.
 *
 * Best-effort by design: a failure here must never break a login that already
 * succeeded.
 */
export async function upgradeLegacyPasswordHash(userId: string, password: string): Promise<void> {
  try {
    const [acct] = await db
      .select({ id: account.id, password: account.password })
      .from(account)
      .where(and(eq(account.userId, BigInt(userId)), eq(account.providerId, "credential")))
      .limit(1);
    if (!acct?.password || !isLegacyHash(acct.password)) return;

    // Sign-in already proved this password, but re-check against the row we are
    // about to overwrite: it costs one bcrypt verify, once per account ever, and
    // makes it impossible to write a hash for the wrong credential if the userId
    // resolution above is ever wrong.
    if (!(await verifyPassword(password, acct.password))) return;

    await db.update(account).set({ password: await hashPassword(password) }).where(eq(account.id, acct.id));
    log.info({ userId }, "upgraded bcrypt credential to scrypt");
  } catch (err) {
    log.error({ err, userId }, "password hash upgrade failed");
  }
}
