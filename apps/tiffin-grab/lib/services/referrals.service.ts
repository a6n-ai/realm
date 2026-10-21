import { randomInt } from "node:crypto";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { orders, payments, referrals, users } from "@/db/schema";
import { normalizeReferralCode } from "@/lib/referrals/cookie";

// No 0/O, 1/I/L: codes get read out loud and typed from screenshots.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
const PAID = ["paid", "simulated_paid"] as const;

export { normalizeReferralCode };

function newCode(): string {
  let s = "";
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return s;
}

/** The customer's share code, made the first time it's needed. */
export async function getOrCreateReferralCode(userId: bigint): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const [row] = await db.select({ code: users.referralCode }).from(users).where(eq(users.id, userId)).limit(1);
    if (row?.code) return row.code;
    try {
      await db.update(users).set({ referralCode: newCode() }).where(and(eq(users.id, userId), isNull(users.referralCode)));
    } catch (e) {
      // Unique clash with another customer's code: roll again.
      if ((e as { cause?: { code?: string } }).cause?.code !== "23505" && (e as { code?: string }).code !== "23505") throw e;
    }
  }
  throw new Error("Could not make a referral code");
}

/** Only an active customer account can refer; staff codes don't exist for this. */
export async function findReferrerByCode(raw: string): Promise<{ id: bigint; publicId: string } | null> {
  const code = normalizeReferralCode(raw);
  if (!code) return null;
  const [row] = await db
    .select({ id: users.id, publicId: users.publicId })
    .from(users)
    .where(and(eq(users.referralCode, code), eq(users.role, "user"), eq(users.status, "active")))
    .limit(1);
  return row ?? null;
}

export type AttachResult = "attached" | "unknown_code" | "self" | "not_eligible" | "already";

/** Links a signing-in customer to the referrer behind `rawCode`. Set once, never moved. */
export async function attachReferral(userId: bigint, rawCode: string): Promise<AttachResult> {
  const referrer = await findReferrerByCode(rawCode);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM ${users} WHERE id = ${userId} FOR UPDATE`);
    const [me] = await tx.select({ role: users.role, referredBy: users.referredByUserId }).from(users).where(eq(users.id, userId)).limit(1);
    if (!me) return "not_eligible";
    if (me.referredBy != null) return "already";
    if (me.role !== "user") return "not_eligible";
    if (!referrer) return "unknown_code";
    if (referrer.id === userId) return "self";

    const [paid] = await tx
      .select({ id: orders.id })
      .from(orders)
      .innerJoin(payments, eq(payments.orderId, orders.id))
      .where(and(eq(orders.userId, userId), inArray(payments.status, [...PAID])))
      .limit(1);
    if (paid) return "not_eligible";

    await tx.update(users).set({ referredByUserId: referrer.id }).where(eq(users.id, userId));
    await tx.insert(referrals).values({ referrerUserId: referrer.id, referredUserId: userId }).onConflictDoNothing({ target: referrals.referredUserId });
    return "attached";
  });
}
