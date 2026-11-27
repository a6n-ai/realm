import { newId } from "@foundry/database";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { admin } from "better-auth/plugins/admin";
import { emailOTP } from "better-auth/plugins/email-otp";
import { waitUntil } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { accounts, rateLimits, sessions, users, verifications } from "../../db/schema";
import type { Env } from "../../env";
import { mailerFor } from "../mail/mailer";
import { trustedIpHeaders } from "../runtime/platform";
import { ac, roles } from "./permissions";

const ID_PREFIX: Record<string, string> = {
  user: "usr",
  session: "ses",
  account: "acc",
  verification: "ver",
  rateLimit: "rlm",
};

export function prefixFor(model: string): string {
  const prefix = ID_PREFIX[model];
  if (!prefix) throw new Error(`no id prefix for Better Auth model "${model}"`);
  return prefix;
}

// The adapter looks up singular keys while the tables are plural.
export const authSchemaMap = { user: users, session: sessions, account: accounts, verification: verifications, rateLimit: rateLimits };

const SIX_MIN_S = 600;
const otpRule = { window: SIX_MIN_S, max: 5 };

// The one options source: createAuth builds from it and the schema test reads its plugins.
export function authOptions(env: Env) {
  if (!env.BETTER_AUTH_SECRET) throw new Error("BETTER_AUTH_SECRET is missing");
  if (!env.BETTER_AUTH_URL) throw new Error("BETTER_AUTH_URL is missing");
  const db = getDb(env);
  return {
    appName: "a6n CRM",
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.BETTER_AUTH_URL],
    // The adapter's `transaction` option is left at its default (off): D1 has no interactive transactions.
    database: drizzleAdapter(db, { provider: "sqlite", schema: authSchemaMap }),
    user: {
      additionalFields: {
        status: { type: "string", defaultValue: "active", input: false },
        passwordSet: { type: "boolean", defaultValue: false, input: false },
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      onPasswordReset: async ({ user }: { user: { id: string } }) => {
        await db.update(users).set({ passwordSet: true }).where(eq(users.id, user.id));
      },
    },
    // Session cookie cache stays off so a removed user loses access on the next request.
    session: { cookieCache: { enabled: false }, freshAge: 3600 },
    advanced: {
      // The mail send runs after the response, so a known address costs the same time as an unknown one.
      backgroundTasks: { handler: (promise: Promise<unknown>) => waitUntil(promise) },
      useSecureCookies: env.BETTER_AUTH_URL.startsWith("https://"),
      ipAddress: { ipAddressHeaders: trustedIpHeaders() },
      database: { generateId: ({ model }: { model: string }) => newId(prefixFor(model)) },
    },
    // Workers have no shared memory, so limits live in D1.
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/get-session": false,
        "/email-otp/send-verification-otp": otpRule,
        "/sign-in/email-otp": otpRule,
        "/email-otp/request-password-reset": otpRule,
        "/email-otp/reset-password": otpRule,
        "/sign-in/email": { window: SIX_MIN_S, max: 10 },
      },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session: { userId: string }) => {
            const [row] = await db.select({ status: users.status }).from(users).where(eq(users.id, session.userId));
            if (row?.status !== "active") throw new APIError("FORBIDDEN", { message: "account not active" });
          },
        },
      },
    },
    plugins: [
      admin({ ac, roles, defaultRole: "sales" }),
      emailOTP({
        disableSignUp: true,
        // Resolved at send time so a missing Relay binding never breaks password sign-in.
        sendVerificationOTP: async ({ email, otp }) => {
          await mailerFor(env).sendSignInCode(email, otp);
        },
      }),
    ],
  } satisfies BetterAuthOptions;
}

export function createAuth(env: Env) {
  return betterAuth(authOptions(env));
}
