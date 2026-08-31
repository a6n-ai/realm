import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { toE164, type ChannelProvider } from "@relay/engine";
import { db } from "@/db/client";
import { phoneVerification } from "@/db/schema";

export const MAX_ATTEMPTS = 5;
const TTL_MS = 10 * 60_000;

const hash = (code: string) => createHash("sha256").update(code).digest("hex");

/**
 * Issue a 6-digit code. Stored hashed: a database read must not hand someone a
 * working code for every pending verification.
 *
 * Returns the plaintext code ONLY so tests can assert against it — no caller in
 * app code may log or return it.
 */
export async function startVerification(
  raw: string,
  deps: { send: ChannelProvider["send"] },
): Promise<{ sent: boolean; code: string | null }> {
  const phone = toE164(raw);
  if (!phone) return { sent: false, code: null };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(phoneVerification).values({
    phone,
    codeHash: hash(code),
    expiresAt: Date.now() + TTL_MS,
  });

  await deps.send({
    to: { phone },
    text: `Your Puchkaman verification code is ${code}. It expires in 10 minutes.`,
  });
  return { sent: true, code };
}

/** Confirm a code. Consumes the row on success; counts the attempt either way. */
export async function confirmVerification(raw: string, code: string): Promise<boolean> {
  const phone = toE164(raw);
  if (!phone) return false;

  const [row] = await db
    .select()
    .from(phoneVerification)
    .where(
      and(
        eq(phoneVerification.phone, phone),
        isNull(phoneVerification.consumedAt),
        gt(phoneVerification.expiresAt, Date.now()),
      ),
    )
    .orderBy(desc(phoneVerification.createdAt))
    .limit(1);

  if (!row || row.attempts >= MAX_ATTEMPTS) return false;

  // Count the attempt BEFORE comparing, so a crash mid-check cannot be used to
  // retry indefinitely.
  await db
    .update(phoneVerification)
    .set({ attempts: row.attempts + 1 })
    .where(eq(phoneVerification.id, row.id));

  const expected = Buffer.from(row.codeHash, "hex");
  const given = Buffer.from(hash(code), "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;

  await db
    .update(phoneVerification)
    .set({ consumedAt: Date.now() })
    .where(eq(phoneVerification.id, row.id));
  return true;
}
