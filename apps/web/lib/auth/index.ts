import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { phoneNumber } from "better-auth/plugins";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { eq } from "drizzle-orm";
import { Role } from "@tiffin/commons";
import { db } from "@/db/client";
import { account, session, users, verification } from "@/db/schema";
import { betterAuthPassword } from "./password";
import { recordAudit } from "@/lib/services/session-service";

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
    minPasswordLength: 8,
    maxPasswordLength: 256,
    requireEmailVerification: false, // customers are phone-first; email optional
    resetPasswordTokenExpiresIn: 60 * 60, // 1 hour
    revokeSessionsOnPasswordReset: true,
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
      // The plugin's /request-password-reset dispatches its OTP through THIS callback,
      // not sendOTP. Without it the phone password-reset code is generated but never
      // sent, so the reset can never complete. Stubbed (logged) until SMS exists.
      sendPasswordResetOTP: async ({ phoneNumber: phone, code }) => {
        console.info(`[auth] phone password-reset OTP for ${phone}: ${code}`);
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
  // Audit: log session deletion as logout.
  // databaseHooks.session.delete.after fires for all session deletes (sign-out,
  // revoke-on-password-reset, admin revocation). Querying publicId here costs one
  // extra SELECT per logout; acceptable for best-effort audit.
  // Doc ref: https://www.better-auth.com/docs/concepts/database#database-hooks
  databaseHooks: {
    session: {
      delete: {
        after: async (sess) => {
          const [user] = await db
            .select({ publicId: users.publicId })
            .from(users)
            .where(eq(users.id, BigInt(sess.userId as string)))
            .limit(1);
          await recordAudit({
            entity: "auth",
            entityPublicId: user?.publicId ?? sess.userId,
            operation: "logout",
            changes: null,
            createdBy: null,
          });
        },
      },
    },
  },
  // Audit: log login success and login_failed from sign-in endpoints.
  // hooks.after fires after the endpoint runs regardless of outcome.
  // ctx.context.newSession is set only on success; ctx.context.returned is an
  // APIError on failure. Phone number body field is `phoneNumber`, not `phone`.
  // Doc ref: https://www.better-auth.com/docs/concepts/hooks
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/email" && ctx.path !== "/sign-in/phone-number") return;

      const method = ctx.path === "/sign-in/phone-number" ? "phone" : "email";
      const newSession = ctx.context.newSession;

      if (newSession) {
        // Login succeeded — user.publicId is the additionalField usr_…
        const publicId = (newSession.user as Record<string, unknown>).publicId as string | undefined;
        await recordAudit({
          entity: "auth",
          entityPublicId: publicId ?? newSession.user.id,
          operation: "login",
          changes: { method },
          createdBy: null,
        });
        return;
      }

      if (ctx.context.returned instanceof APIError) {
        // Login failed — log the attempted identifier (never the password).
        const body = ctx.body as { email?: string; phoneNumber?: string } | undefined;
        const identifier = body?.email ?? body?.phoneNumber ?? "unknown";
        await recordAudit({
          entity: "auth",
          entityPublicId: identifier,
          operation: "login_failed",
          changes: { method },
          createdBy: null,
        });
      }
    }),
  },
});
