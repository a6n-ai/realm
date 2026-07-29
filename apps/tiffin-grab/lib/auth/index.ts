import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { phoneNumber, username, emailOTP } from "better-auth/plugins";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { eq } from "drizzle-orm";
import { authAuditAction } from "@realm/auth";
import { Role } from "@realm/commons";
import { createLogger } from "@realm/commons/logger";
import { db } from "@/db/client";
import { account, session, users, verification } from "@/db/schema";
import { betterAuthPassword } from "./password";
import { notifyNewLoginIfNewDevice, notifyPasswordChanged, sendAuthOtp, sendVerification } from "./security-events";
import { recordAudit } from "@/lib/services/session-service";

const log = createLogger("auth");

const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: users, account, session, verification },
  }),
  advanced: {
    database: { generateId: false },
    // Trust ONLY x-real-ip, which Caddy overwrites with the real socket peer
    // (`header_up X-Real-IP {remote_host}`). The default is x-forwarded-for,
    // whose leftmost token better-auth takes verbatim — and Caddy *appends* to
    // that header, so a client can prepend any value and pick its own bucket.
    // Every rate limit (sign-in 3/10s, OTP 3/60s) keys off this, so a spoofable
    // IP silently disables all of them. Also keys session.ipAddress, which the
    // new-device sign-in alert compares against.
    ipAddress: { ipAddressHeaders: ["x-real-ip"] },
  },
  // ponytail: default in-memory rate-limit store. Correct for one instance;
  // counters reset on deploy. Move to `storage: "database"` (needs a rateLimit
  // table migration) if this app is ever scaled past a single process.
  // freshAge gates sensitive endpoints (change-email, delete-user) on a
  // recently-authenticated session. Default is 24h, which is most of a working
  // day against a 30-day session; 1h keeps a walked-away browser from being
  // enough to change the account's email.
  session: { expiresIn: SESSION_MAX_AGE_S, freshAge: 60 * 60 },
  emailAndPassword: {
    enabled: true,
    password: betterAuthPassword,
    // Enforced on sign-up / change / reset only — never on sign-in, so raising
    // this cannot lock out an existing account with a shorter password.
    minPasswordLength: 12,
    maxPasswordLength: 256,
    // Email is REQUIRED on every account (users.email is NOT NULL and the
    // services enforce it) — it is the login path and the only channel for
    // verification, reset and security alerts. Verification is still not
    // *required to sign in*: checkout provisions a customer who must be able to
    // reach /set-password via the verify link, and sendOnSignUp below mails it.
    requireEmailVerification: false,
    // Password reset is OTP-based (emailOTP plugin below); no reset links.
    revokeSessionsOnPasswordReset: true,
  },
  emailVerification: {
    // Every account has an email now, so this always fires on signup.
    sendOnSignUp: true,
    // Clicking the verify link signs the user in — checkout onboarding relies on
    // this to land a brand-new customer on /set-password with a live session.
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerification(user, url);
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
        log.debug(`phone OTP for ${phone}: ${code}`);
      },
      // The plugin's /request-password-reset dispatches its OTP through THIS callback,
      // not sendOTP. Without it the phone password-reset code is generated but never
      // sent, so the reset can never complete. Stubbed (logged) until SMS exists.
      sendPasswordResetOTP: async ({ phoneNumber: phone, code }) => {
        log.debug(`phone password-reset OTP for ${phone}: ${code}`);
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
    // Sign in with a username (lowercased/unique). Complements email + phone —
    // the login form picks the endpoint from the identifier's shape.
    username({ minUsernameLength: 3, maxUsernameLength: 30 }),
    // No anonymous plugin: it minted users with no email, which contradicts email
    // being required, and nothing ever called it — while /sign-in/anonymous stayed
    // mounted and reachable, so anyone could create unlimited PII-less rows.
    // Email OTP: 6-digit codes for password reset and email change. Codes are
    // stored hashed and expire in 10 min. The single sendVerificationOTP callback
    // routes each type to the shared @realm/auth copy via SES.
    emailOTP({
      otpLength: 6,
      expiresIn: 600,
      allowedAttempts: 5,
      storeOTP: "hashed",
      changeEmail: { enabled: true, verifyCurrentEmail: true },
      sendVerificationOTP: async ({ email, otp, type }) => {
        await sendAuthOtp(email, otp, type);
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
      // Login gate: only `active` accounts may get a session. Fires after the
      // credential/OTP check passes, so a deactivated/suspended/deleted user is
      // authenticated but denied a session. Existing sessions are additionally
      // re-checked in the Node getSession path (see requireAccountUser).
      create: {
        before: async (sess) => {
          const [u] = await db
            .select({ status: users.status })
            .from(users)
            .where(eq(users.id, BigInt(sess.userId as string)))
            .limit(1);
          if (u && u.status !== "active") {
            throw new APIError("FORBIDDEN", { message: "This account is not active. Contact support." });
          }
        },
      },
      delete: {
        after: async (sess) => {
          try {
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
          } catch (e) {
            log.error({ err: e }, "audit logout hook failed");
          }
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
      const failed = ctx.context.returned instanceof APIError;

      // Security audit: every mapped auth event lands in the SAME append-only
      // audit_log as the rest of the app, via the shared vocabulary in
      // @realm/auth. Sign-in/out keep their dedicated operations below; this
      // covers password changes, resets, verification, revocations, deletion.
      // Placed before the early returns so nothing downstream can skip it.
      const auditAction = authAuditAction(ctx.path);
      if (auditAction && !failed) {
        try {
          const body = ctx.body as { email?: string } | undefined;
          const sessionUser = (
            ctx.context as { session?: { user?: { email?: string; publicId?: string } } }
          ).session?.user;
          await recordAudit({
            entity: "auth",
            entityPublicId: sessionUser?.publicId ?? body?.email ?? sessionUser?.email ?? "unknown",
            operation: "update",
            changes: { _action: auditAction },
            createdBy: null,
          });
        } catch (e) {
          log.error({ err: e, action: auditAction }, "auth audit hook failed");
        }
      }

      // Password changed — OTP reset (body carries email) or authenticated change
      // (email from the session). Fire the security alert on success only.
      if (ctx.path === "/email-otp/reset-password" || ctx.path === "/change-password") {
        if (failed) return;
        try {
          const body = ctx.body as { email?: string } | undefined;
          const sessionEmail = (ctx.context as { session?: { user?: { email?: string } } }).session?.user?.email;
          await notifyPasswordChanged(body?.email ?? sessionEmail ?? null);
        } catch (e) {
          log.error({ err: e }, "password-changed email hook failed");
        }
        return;
      }

      const SIGN_IN_PATHS = ["/sign-in/email", "/sign-in/phone-number", "/sign-in/username"];
      if (!SIGN_IN_PATHS.includes(ctx.path)) return;

      const method =
        ctx.path === "/sign-in/phone-number" ? "phone" : ctx.path === "/sign-in/username" ? "username" : "email";
      const newSession = ctx.context.newSession;

      if (newSession) {
        // Login succeeded — user.publicId is the additionalField usr_…
        try {
          const publicId = (newSession.user as Record<string, unknown>).publicId as string | undefined;
          await recordAudit({
            entity: "auth",
            entityPublicId: publicId ?? newSession.user.id,
            operation: "login",
            changes: { method },
            createdBy: null,
          });
        } catch (e) {
          log.error({ err: e }, "audit login hook failed");
        }
        // New-device sign-in alert (best-effort; skips known IPs).
        try {
          const s = newSession.session as { userId: string; ipAddress?: string | null; userAgent?: string | null };
          await notifyNewLoginIfNewDevice({
            userId: String(s.userId),
            email: newSession.user.email,
            ip: s.ipAddress,
            userAgent: s.userAgent,
          });
        } catch (e) {
          log.error({ err: e }, "new-login email hook failed");
        }
        return;
      }

      if (ctx.context.returned instanceof APIError) {
        // Login failed — log the attempted identifier (never the password).
        try {
          const body = ctx.body as { email?: string; phoneNumber?: string; username?: string } | undefined;
          const identifier = body?.email ?? body?.phoneNumber ?? body?.username ?? "unknown";
          await recordAudit({
            entity: "auth",
            entityPublicId: identifier,
            operation: "login_failed",
            changes: { method },
            createdBy: null,
          });
        } catch (e) {
          log.error({ err: e }, "audit login_failed hook failed");
        }
      }
    }),
  },
});
