import { hashPassword as scryptHash, verifyPassword as scryptVerify } from "better-auth/crypto";
import { createLogger } from "@realm/commons/logger";

const log = createLogger("auth:password");

/** better-auth scrypt output: "<salt-hex>:<hash-hex>". */
const SCRYPT_FORMAT = /^[0-9a-f]+:[0-9a-f]+$/;

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

/** What a stored hash looks like, for logging. Never returns any of the hash itself. */
function describeHash(hash: string): string {
  if (!hash) return "empty";
  if (/^\$2[aby]\$/.test(hash)) return "bcrypt (pre-scrypt-cutover)";
  if (SCRYPT_FORMAT.test(hash)) return "scrypt";
  return "unrecognised";
}

/**
 * better-auth's scrypt verify THROWS "Invalid password hash" on anything that
 * isn't its own format — including a bcrypt hash left over from before the
 * cutover. An unhandled throw on the sign-in path is a 500 rather than a clean
 * rejection, so fail closed: an unreadable hash is simply a failed login.
 *
 * Failing closed is right, but silent it is a trap: it renders "this hash cannot
 * be read" identical to "you typed the wrong password". A whole login path can
 * stay broken behind an `account` row that looks perfectly healthy, and the only
 * symptom is a user insisting their password works. So the two cases are logged
 * differently — the return value is unchanged, this is purely diagnosis.
 *
 * Never logs the password, the hash, or any prefix of it: only which format the
 * stored value is in, which is what tells an operator whether they are looking at
 * a stale row or a genuine mismatch.
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!SCRYPT_FORMAT.test(hash)) {
    log.error(
      { hashFormat: describeHash(hash) },
      "stored password hash is not scrypt and cannot be verified — login will always fail for this account until the password is reset",
    );
    return false;
  }
  try {
    return await scryptVerify({ hash, password: plain });
  } catch (err) {
    // Well-formed but unusable (truncated, wrong scrypt parameters). Still fail closed.
    log.error(
      { err, hashFormat: describeHash(hash) },
      "scrypt rejected a well-formed password hash — the stored value is corrupt, not merely mismatched",
    );
    return false;
  }
}
