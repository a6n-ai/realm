import { createHash, randomBytes } from "node:crypto";

export function hashApiKey(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export function generateApiKey(): { secret: string; prefix: string; hash: string } {
  const secret = `pk_live_${randomBytes(24).toString("hex")}`;
  return { secret, prefix: secret.slice(0, 16), hash: hashApiKey(secret) };
}

export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) return null;
  return token;
}
