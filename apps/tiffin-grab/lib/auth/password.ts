import { randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "@realm/auth";

export { hashPassword, verifyPassword };

// A unique, unguessable one-time password for a freshly provisioned or reset
// account. The holder never types it: the first-login gate forces /set-password,
// or they claim the account via the existing forgot-password (phone OTP / email)
// flow. Unique per account — no shared backdoor (replaces the old shared constant).
export function generateTempPassword(): string {
  return randomBytes(18).toString("base64url"); // ~24 url-safe chars, ~108 bits
}

// Better Auth password adapter, wired to the shared bcrypt hashing.
export const betterAuthPassword = {
  hash: (password: string) => hashPassword(password),
  verify: ({ hash, password }: { hash: string; password: string }) => verifyPassword(password, hash),
};
