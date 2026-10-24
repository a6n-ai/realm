import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// The email queue fetches the receipt PDF with no session, so the attachment url
// carries its own proof: an HMAC over the order id and an expiry. Seven days covers
// the outbox's retries; a forwarded email stops opening the file after that.
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

function key(): Buffer {
  const secret =
    process.env.BETTER_AUTH_SECRET ?? (process.env.NODE_ENV === "production" ? undefined : "dev-receipt-secret");
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  return createHash("sha256").update(`receipt-link:${secret}`).digest();
}

function sign(orderPublicId: string, exp: number): string {
  return createHmac("sha256", key()).update(`${orderPublicId}.${exp}`).digest("base64url");
}

export function receiptPath(orderPublicId: string): string {
  return `/api/receipts/${encodeURIComponent(orderPublicId)}`;
}

/** Absolute, signed url for the email attachment. */
export function signedReceiptUrl(orderPublicId: string, now = Date.now()): string {
  const exp = now + TTL_MS;
  const origin = (process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? "").trim().replace(/\/$/, "");
  // The email queue fetches this from the server: a relative url can never resolve.
  if (!origin) throw new Error("BETTER_AUTH_URL is not set; cannot build the receipt link");
  return `${origin}${receiptPath(orderPublicId)}?exp=${exp}&sig=${sign(orderPublicId, exp)}`;
}

export function verifyReceiptSignature(orderPublicId: string, exp: string | null, sig: string | null, now = Date.now()): boolean {
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now) return false;
  const want = Buffer.from(sign(orderPublicId, Number(exp)));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** The email attachment ref, or [] when the link can't be built: never block a payment confirm over a receipt. */
export function receiptAttachments(order: { publicId: string; deploymentId: string }) {
  try {
    return [{ filename: `TiffinGrab-receipt-${order.deploymentId}.pdf`, url: signedReceiptUrl(order.publicId), contentType: "application/pdf" }];
  } catch (e) {
    console.error("[receipt] attachment skipped:", e);
    return [];
  }
}
