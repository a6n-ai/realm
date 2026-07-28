import bcrypt from "bcryptjs";
import { hashPassword as scryptHash, verifyPassword as scryptVerify } from "better-auth/crypto";

// Hashes written before the scrypt cutover are bcrypt, which is self-identifying:
// every bcrypt hash starts with "$2" ($2a$/$2b$/$2y$ + cost). better-auth's scrypt
// format is "<salt-hex>:<hash-hex>" and never starts with "$", so the two can be
// told apart without storing an algorithm column.
export function isLegacyHash(hash: string): boolean {
  return hash.startsWith("$2");
}

/**
 * New hashes use better-auth's default scrypt: memory-hard (an attacker must
 * allocate RAM per guess, which is what actually blunts GPU cracking) and native,
 * where bcryptjs was pure JS — slow for us, no slower for an attacker running
 * optimised C. Measured at parity on our side: ~52ms vs ~60ms for bcrypt cost 10.
 */
export function hashPassword(plain: string): Promise<string> {
  return scryptHash(plain);
}

/**
 * Verifies BOTH formats, so accounts hashed before the cutover keep working.
 * Legacy hashes are upgraded opportunistically on successful sign-in — see each
 * app's lib/auth/password-upgrade.ts — because that is the only moment the
 * plaintext is in hand. Keep this branch until no bcrypt hashes remain.
 */
export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return isLegacyHash(hash) ? bcrypt.compare(plain, hash) : scryptVerify({ hash, password: plain });
}
