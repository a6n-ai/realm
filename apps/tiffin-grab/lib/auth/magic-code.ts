import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// The code email's "Copy code" button opens /magic-link?t=<token>. The token is
// the code sealed with AES-256-GCM, so the URL (history, logs, link scanners)
// never carries the code itself, and no table is needed to look it up.
const TTL_MS = 10 * 60 * 1000; // matches emailOTP expiresIn

function key(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  return createHash("sha256").update(`magic-link:${secret}`).digest();
}

export function sealCode(otp: string, now = Date.now()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify({ c: otp, e: now + TTL_MS })), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** The code, or null when the token is forged, damaged or expired. */
export function openCode(token: string, now = Date.now()): string | null {
  try {
    const raw = Buffer.from(token, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const { c, e } = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString());
    return typeof c === "string" && typeof e === "number" && now <= e ? c : null;
  } catch {
    return null;
  }
}
