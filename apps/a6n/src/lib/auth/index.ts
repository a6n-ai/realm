import { newId } from "@foundry/database";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
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
import { readSecret } from "../secrets";

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

// Every admin-plugin route except has-permission; roles carry no user/session resources, so these are also denied by permissions.
const ADMIN_DISABLED_PATHS = [
  "set-role", "get-user", "create-user", "update-user", "list-users", "list-user-sessions", "unban-user", "ban-user",
  "impersonate-user", "stop-impersonating", "revoke-user-session", "revoke-user-sessions", "remove-user", "set-user-password",
].map((p) => `/admin/${p}`);

// Routes that take an email and can mint a session or write a credential.
const GUARDED_PATHS = new Set([
  "/sign-in/email",
  "/sign-in/email-otp",
  "/email-otp/check-verification-otp",
  "/email-otp/verify-email",
  "/email-otp/request-password-reset",
  "/forget-password/email-otp",
  "/email-otp/reset-password",
]);

const TEN_MIN_S = 600;
const otpRule = { window: TEN_MIN_S, max: 5 };

// The one options source: createAuth builds from it and the schema test reads its plugins.
export function authOptions(env: Env, secret: string | undefined) {
  if (!secret) throw new Error("BETTER_AUTH_SECRET is missing");
  if (!env.BETTER_AUTH_URL) throw new Error("BETTER_AUTH_URL is missing");
  const db = getDb(env);
  return {
    appName: "a6n",
    secret,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.BETTER_AUTH_URL],
    disabledPaths: ADMIN_DISABLED_PATHS,
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
      // Matches the seed's owner-password rule.
      minPasswordLength: 12,
      // A reset is often a response to a leaked password, so it signs every device out.
      revokeSessionsOnPasswordReset: true,
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
        "/sign-in/email": { window: TEN_MIN_S, max: 10 },
      },
    },
    hooks: {
      // A removed user must not mint a session or write a credential through any email route, and must answer
      // exactly like an unknown email: the request carries on with an address that cannot exist.
      // Normalise exactly like Better Auth (lowercase, no trim): a padded email must fail its validation the same way.
      before: createAuthMiddleware(async (ctx) => {
        if (!GUARDED_PATHS.has(ctx.path)) return;
        const email = (ctx.body as { email?: unknown } | undefined)?.email;
        if (typeof email !== "string") return;
        const [row] = await db.select({ status: users.status }).from(users).where(eq(users.email, email.toLowerCase()));
        if (row && row.status !== "active") return { context: { body: { ...(ctx.body as object), email: `${crypto.randomUUID()}@removed.invalid` } } };
      }),
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session: { userId: string }) => {
            const [row] = await db.select({ status: users.status }).from(users).where(eq(users.id, session.userId));
            if (row?.status !== "active") throw new APIError("FORBIDDEN", { message: "account not active" });
          },
          // Kept on the user row: sessions are deleted on sign-out and expiry, so they cannot answer "last sign-in".
          after: async (session: { userId: string }) => {
            await db.update(users).set({ lastSignInAt: new Date() }).where(eq(users.id, session.userId));
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
          // Silent for removed users: no code, and no difference a caller can observe.
          const [row] = await db.select({ status: users.status }).from(users).where(eq(users.email, email.toLowerCase()));
          if (row && row.status !== "active") return;
          await mailerFor(env).sendSignInCode(email, otp);
        },
      }),
    ],
  } satisfies BetterAuthOptions;
}

export async function createAuth(env: Env) {
  return betterAuth(authOptions(env, await readSecret(env.BETTER_AUTH_SECRET)));
}
