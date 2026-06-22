import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { phoneNumber } from "better-auth/plugins";
import { Role } from "@tiffin/commons";
import { db } from "@/db/client";
import { account, session, users, verification } from "@/db/schema";
import { betterAuthPassword } from "./password";

const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustHost: true,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: users, account, session, verification },
  }),
  advanced: { database: { generateId: false } },
  session: { expiresIn: SESSION_MAX_AGE_S },
  emailAndPassword: {
    enabled: true,
    password: betterAuthPassword,
    sendResetPassword: async ({ user, url }) => {
      console.info(`[auth] password reset for ${user.email ?? user.id}: ${url}`);
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      console.info(`[auth] verify email for ${user.email ?? user.id}: ${url}`);
    },
  },
  user: {
    // BA's createdAt/updatedAt must point at the bauth_* timestamp columns, not
    // the house bigint epoch-ms created_at/updated_at columns.
    fields: { createdAt: "bauthCreatedAt", updatedAt: "bauthUpdatedAt" },
    additionalFields: {
      role: { type: "string", required: false, defaultValue: Role.USER, input: false },
      publicId: { type: "string", required: false, input: false },
    },
  },
  plugins: [
    phoneNumber({
      sendOTP: async ({ phoneNumber: phone, code }) => {
        console.info(`[auth] phone OTP for ${phone}: ${code}`);
      },
      // Map the plugin's phoneNumber/phoneNumberVerified model fields onto the
      // existing `phone` and `phoneVerified` columns in the users table.
      schema: {
        user: {
          fields: {
            phoneNumber: "phone",
            phoneNumberVerified: "phoneVerified",
          },
        },
      },
    }),
    nextCookies(),
  ],
});
