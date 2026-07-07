import { hashPassword, verifyPassword } from "@realm/auth";

export { hashPassword, verifyPassword };

// Shared temporary password every provisioned/reset account receives. It is
// single-use: the first-login gate forces /set-password before the app is usable
// (password_set flips true once they do).
// TEMPORARY TRADEOFF: shared (not per-user random) ON PURPOSE — there is no
// email/SMS delivery yet, so a random secret would lock users out (no way to send
// a reset). Switch back to a per-user random secret + set-password invite once
// notification delivery exists. Kept equal to the seeded admin password so every
// account shares one temp.
export const DEFAULT_TEMP_PASSWORD = "changeme123";

// Better Auth password adapter, wired to the shared bcrypt hashing.
export const betterAuthPassword = {
  hash: (password: string) => hashPassword(password),
  verify: ({ hash, password }: { hash: string; password: string }) => verifyPassword(password, hash),
};
