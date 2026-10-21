import { randomUUID } from "node:crypto";
import { ValidationError } from "@foundry/commons";
import { getRedis } from "@/lib/redis";

// Longer than payByCard's worst case (about six Stripe calls at up to 30s each).
const LOCK_MS = 180_000;
export const PAY_IN_PROGRESS = "A payment is already in progress.";
const RELEASE = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

/**
 * One card charge flow per customer at a time, across checkout and the /me/pay page: a second
 * order replaces the first only if the first is not mid-charge, so two overlapping flows could
 * charge twice. Redis rather than a DB lock so no pooled connection is held across the Stripe call.
 * Fails closed when Redis is down. The TTL frees the key if the process dies mid-charge.
 */
export async function withCustomerPayLock<T>(userPublicId: string, fn: () => Promise<T>): Promise<T> {
  const key = `pay-lock:${userPublicId}`;
  const owner = randomUUID();
  const redis = getRedis();
  let got: string | null;
  try {
    got = await redis.set(key, owner, "PX", LOCK_MS, "NX");
  } catch {
    throw new ValidationError("Card payments are busy, please try again.");
  }
  if (got !== "OK") throw new ValidationError(PAY_IN_PROGRESS);
  try {
    return await fn();
  } finally {
    await redis.eval(RELEASE, 1, key, owner).catch(() => {});
  }
}
