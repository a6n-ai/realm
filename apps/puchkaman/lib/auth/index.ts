import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins";
import { createLogger } from "@realm/commons/logger";
import { authAuditAction } from "@realm/auth";
import { orderTracking } from "@realm/order-tracking";
import { resolveTrackingSubject } from "@/lib/order-tracking/subject";
import { Role } from "@realm/commons";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { account, session, users, verification } from "@/db/schema";
import { recordAudit } from "@/lib/services/session-service";
import { betterAuthPassword } from "./password";
import { sendAuthOtp } from "./security-events";

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
    // that header, so a client can prepend any value and pick its own bucket,
    // defeating every rate limit (sign-in 3/10s, OTP 3/60s) that keys off it.
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
    // Admin-only app: accounts are seeded or created by an admin, and there is
    // no signup UI. better-auth still mounts /sign-up/email whenever
    // email+password is enabled, so without this anyone could POST themselves
    // an account. There is no self-registration path here by design.
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 256,
    requireEmailVerification: false,
    // Password reset is OTP-based (emailOTP plugin below); no reset links.
    revokeSessionsOnPasswordReset: true,
  },
  user: {
    fields: { createdAt: "bauthCreatedAt", updatedAt: "bauthUpdatedAt" },
    additionalFields: {
      role: { type: "string", required: false, defaultValue: Role.USER, input: false },
      publicId: { type: "string", required: false, input: false },
    },
  },
  plugins: [
    // Public order tracking. Guests exchange the last 4 digits of the phone on
    // the order for a signed, order-scoped grant cookie; logged-in owners skip
    // the PIN. Deliberately not the anonymous plugin — that would mint a user
    // row per guest into a table this app surfaces in admin listings.
    orderTracking({ resolve: resolveTrackingSubject }),
    // Email OTP: 6-digit codes for password reset. Codes are stored hashed and
    // expire in 10 min. sendVerificationOTP routes the code via SES.
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
  // Audit: session delete → logout (sign-out, revoke-on-password-reset, etc.).
  databaseHooks: {
    session: {
      // Login gate: only `active` accounts may get a session. Fires after the
      // credential check passes but before a session row is written, so a
      // suspended/inactive user authenticates successfully and still gets
      // nothing — and it covers every sign-in method at once rather than each
      // route separately. Existing sessions are re-checked on the read path
      // (see the dashboard layout).
      create: {
        before: async (sess) => {
          const [u] = await db
            .select({ status: users.status })
            .from(users)
            .where(eq(users.id, BigInt(sess.userId as string)))
            .limit(1);
          if (u && u.status !== "active") {
            throw new APIError("FORBIDDEN", { message: "This account is not active. Contact an administrator." });
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
              entityPublicId: user?.publicId ?? String(sess.userId),
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
  // Audit: login success / login_failed on email sign-in.
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      // Security audit: every mapped auth event lands in the SAME append-only
      // audit_log as the rest of the app, via the shared vocabulary in
      // @realm/auth. Sign-in keeps its dedicated operation below; this covers
      // password changes, resets, verification, revocations, deletion.
      const auditAction = authAuditAction(ctx.path);
      if (auditAction && !(ctx.context.returned instanceof APIError)) {
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

      if (ctx.path !== "/sign-in/email") return;

      const newSession = ctx.context.newSession;
      if (newSession) {
        try {
          const publicId = (newSession.user as Record<string, unknown>).publicId as string | undefined;
          await recordAudit({
            entity: "auth",
            entityPublicId: publicId ?? newSession.user.id,
            operation: "login",
            changes: { method: "email" },
            createdBy: null,
          });
        } catch (e) {
          log.error({ err: e }, "audit login hook failed");
        }
        return;
      }

      if (ctx.context.returned instanceof APIError) {
        try {
          const body = ctx.body as { email?: string } | undefined;
          await recordAudit({
            entity: "auth",
            entityPublicId: body?.email ?? "unknown",
            operation: "login_failed",
            changes: { method: "email" },
            createdBy: null,
          });
        } catch (e) {
          log.error({ err: e }, "audit login_failed hook failed");
        }
      }
    }),
  },
});
