import { z } from "zod";

// Must stay in step with `emailAndPassword.minPasswordLength` in each app's
// better-auth config — this is the client/server-action gate, that is the
// endpoint gate. Applies to new and changed passwords only; sign-in never
// checks length, so existing shorter passwords keep working.
export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(256, "Password is too long");
