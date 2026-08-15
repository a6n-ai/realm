import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Twilio signs each webhook with HMAC-SHA1 over the full URL plus the POST
 * parameters sorted by key and concatenated.
 *
 * Without this check anyone could POST a forged STOP for an arbitrary number —
 * or, worse, a forged START to undo someone's opt-out, which would put us in
 * breach of carrier rules on a number that had explicitly opted out.
 */
export function verifyTwilioSignature(
  url: string,
  params: Record<string, string>,
  authToken: string,
  header: string | null,
): boolean {
  if (!header) return false;
  const payload = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  const expected = createHmac("sha1", authToken).update(Buffer.from(payload, "utf-8")).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}
