import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin as adminPlugin } from "better-auth/plugins";
import { Role } from "@foundry/commons";
import { db } from "@/db/client";
import { account, session, users, verification } from "@/db/schema";
import { ac, roles } from "./permissions";
import { betterAuthPassword } from "./password";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: users, account, session, verification },
  }),
  advanced: {
    database: { generateId: false },
    ipAddress: { ipAddressHeaders: ["x-real-ip"] },
  },
  session: { expiresIn: 30 * 24 * 60 * 60, freshAge: 60 * 60 },
  emailAndPassword: {
    enabled: true,
    password: betterAuthPassword,
    minPasswordLength: 12,
    maxPasswordLength: 256,
    disableSignUp: true,
    requireEmailVerification: false,
  },
  user: {
    fields: { createdAt: "bauthCreatedAt", updatedAt: "bauthUpdatedAt" },
    additionalFields: {
      role: { type: "string", required: false, defaultValue: Role.ADMIN, input: false },
      publicId: { type: "string", required: false, input: false },
    },
  },
  plugins: [
    adminPlugin({ ac, roles }),
    nextCookies(),
  ],
});
