import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { phoneNumber } from "better-auth/plugins";
import { db } from "@/db/client";
import { users } from "@/db/schema";

// TEMPORARY config used only to run `better-auth generate`. Replaced by the
// real config in Task 3.
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema: { user: users } }),
  emailAndPassword: { enabled: true },
  plugins: [phoneNumber()],
});
