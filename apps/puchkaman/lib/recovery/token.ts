import { createHmac, timingSafeEqual } from "node:crypto";
import { SITE_URL } from "@/lib/seo";

/**
 * A recovery link is a capability: it reopens payment for one order without a
 * login. It is scoped to that order and expires at the terminalization
 * boundary, so a link and the order it pays die together — never a live link
 * settling an order whose coins have just been returned.
 */
function sign(orderPublicId: string, expiresAt: number, secret: string): string {
  return createHmac("sha256", secret).update(`${orderPublicId}.${expiresAt}`).digest("hex");
}

export function mintResumeToken(orderPublicId: string, expiresAt: number): string {
  const secret = process.env.RECOVERY_LINK_SECRET;
  if (!secret) throw new Error("RECOVERY_LINK_SECRET is not set");
  return `${expiresAt}.${sign(orderPublicId, expiresAt, secret)}`;
}

export function verifyResumeToken(orderPublicId: string, token: string, now = Date.now()): boolean {
  // Fail closed: an unset secret refuses every link rather than accepting any.
  const secret = process.env.RECOVERY_LINK_SECRET;
  if (!secret) return false;

  const [rawExp, mac] = token.split(".");
  const expiresAt = Number(rawExp);
  if (!Number.isFinite(expiresAt) || !mac) return false;
  if (expiresAt < now) return false;

  const expected = Buffer.from(sign(orderPublicId, expiresAt, secret), "hex");
  const given = Buffer.from(mac, "hex");
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

export function resumeUrl(orderPublicId: string, expiresAt: number): string {
  const token = mintResumeToken(orderPublicId, expiresAt);
  return `${SITE_URL}/checkout/resume?order=${encodeURIComponent(orderPublicId)}&t=${token}`;
}
