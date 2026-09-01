import { scryptSync, randomBytes } from "node:crypto";

const API_KEY_SALT = "relay-api-key-v1";

export function hashApiKey(secret: string): string {
  return scryptSync(secret, API_KEY_SALT, 32).toString("hex");
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
