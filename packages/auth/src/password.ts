import { hashPassword as scryptHash, verifyPassword as scryptVerify } from "better-auth/crypto";

/**
 * scrypt, better-auth's default. Memory-hard — an attacker must allocate RAM per
 * guess, which is what actually blunts GPU cracking — and native, where the
 * previous bcryptjs was pure JS: slow for us, no slower for an attacker running
 * optimised C. Format is "<salt-hex>:<hash-hex>".
 *
 * There is no bcrypt fallback: both databases were rebuilt from empty at the
 * cutover, so no legacy hash exists to verify.
 */
export function hashPassword(plain: string): Promise<string> {
  return scryptHash(plain);
}

/**
 * better-auth's scrypt verify THROWS "Invalid password hash" on anything that
 * isn't its own format — including a bcrypt hash left over from before the
 * cutover. An unhandled throw on the sign-in path is a 500 rather than a clean
 * rejection, so fail closed: an unreadable hash is simply a failed login.
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await scryptVerify({ hash, password: plain });
  } catch {
    return false;
  }
}
