import { hashPassword, verifyPassword } from "@realm/auth";

export { hashPassword, verifyPassword };

// ponytail: SECURITY DEBT — the single shared default password every provisioned
// account (customer at checkout, staff on admin reset) receives. It is single-use:
// the first-login gate forces the holder to /set-password before they can use the
// app, and users.password_set flips true once they do. Replace with a per-user
// random password mailed via the notification system when email/SES is wired.
export const DEFAULT_TEMP_PASSWORD = "Tiffin123";

// Better Auth password adapter, wired to the shared bcrypt hashing.
export const betterAuthPassword = {
  hash: (password: string) => hashPassword(password),
  verify: ({ hash, password }: { hash: string; password: string }) => verifyPassword(password, hash),
};
