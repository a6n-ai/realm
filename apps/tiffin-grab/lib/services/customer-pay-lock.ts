import { randomUUID } from "node:crypto";
import { ValidationError } from "@foundry/commons";
import { acquireLease, releaseLease } from "@/lib/runtime/lease";

// Longer than payByCard's worst case (about six Stripe calls at up to 30s each).
const LOCK_MS = 180_000;
export const PAY_IN_PROGRESS = "A payment is already in progress.";

/**
 * One card charge flow per customer at a time, across checkout and the /me/pay page: a second
 * order replaces the first only if the first is not mid-charge, so two overlapping flows could
 * charge twice. A Postgres lease rather than a held DB lock, so no pooled connection is held across
 * the Stripe call. Fails closed when the DB is down. The TTL frees the lease if the process dies mid-charge.
 */
export async function withCustomerPayLock<T>(userPublicId: string, fn: () => Promise<T>): Promise<T> {
  const key = `pay-lock:${userPublicId}`;
  const owner = randomUUID();
  let got: boolean;
  try {
    got = await acquireLease(key, owner, LOCK_MS);
  } catch {
    throw new ValidationError("Card payments are busy, please try again.");
  }
  if (!got) throw new ValidationError(PAY_IN_PROGRESS);
  try {
    return await fn();
  } finally {
    await releaseLease(key, owner).catch(() => {});
  }
}
