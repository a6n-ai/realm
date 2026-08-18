import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin as adminPlugin, emailOTP, organization as organizationPlugin } from "better-auth/plugins";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { eq } from "drizzle-orm";
import { assertHierarchyDepth, authAuditAction } from "@realm/auth";
import { Role } from "@realm/commons";
import { createLogger } from "@realm/commons/logger";
import { db } from "@/db/client";
import { account, organization, session, users, verification } from "@/db/schema";
import { betterAuthPassword } from "./password";
import { ac, roles } from "./permissions";
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
    // Signup goes through signUpCustomer (app/(auth)/signup/actions.ts), which
    // enforces phone uniqueness and writes the users + account rows itself.
    // better-auth still mounts /sign-up/email whenever email+password is
    // enabled, and nothing in this app calls it — leaving it open is a second,
    // unvalidated way to create an account that skips every one of those rules.
    disableSignUp: true,
    // A verified email is required to hold a session. This gates SIGN-IN only —
    // checkout takes no session at all, so paying is never blocked by it.
    // better-auth applies this to /sign-in/email but NOT to the emailOTP plugin's
    // /sign-in/email-otp, so the real enforcement is the session.create.before hook
    // below; this flag keeps the per-route error accurate.
    requireEmailVerification: true,
    // Password reset is OTP-based (emailOTP plugin below); no reset links.
    revokeSessionsOnPasswordReset: true,
    // An invited staff account starts with passwordSet=false and no credential;
    // completing the OTP reset is them choosing a password. Without this they are
    // bounced to /set-password forever.
    onPasswordReset: async ({ user }) => {
      try {
        await db.update(users).set({ passwordSet: true }).where(eq(users.id, BigInt(user.id)));
      } catch (e) {
        log.error({ err: e }, "passwordSet flip after reset failed");
      }
    },
  },
  emailVerification: {
    // Every account has an email now, so this always fires on signup.
    sendOnSignUp: true,
    // Re-send the link when a blocked user tries to sign in. Without this a
    // never-verified account gets a bare 403 with no way to trigger a new mail —
    // a dead end, since the original link expires.
    sendOnSignIn: true,
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
      // Platform-wide override role (e.g. "super_admin"), separate from the
      // per-org `member.role`. See @realm/auth resolveVisibleOrgIds — this is
      // the ONLY bypass of membership-scoped visibility, and it's audited.
      platformRole: { type: "string", required: false, defaultValue: null, input: false },
    },
  },
  plugins: [
    // Deliberately NO phoneNumber / username / anonymous plugins. Each mounted live
    // sign-in endpoints that nothing in this app ever called — the login form only uses
    // /sign-in/email and /sign-in/email-otp. Unused auth surface is not free: the phone
    // plugin's OTP senders were stubs that logged the code, so a single LOG_LEVEL=debug
    // would have put working sign-in codes into CloudWatch for every user with a phone.
    // Add them back with a real sender, not a stub, if phone or username login is wanted.
    // The `phone` and `username` COLUMNS stay — they are app data (delivery contact,
    // profile handle) and are written through usersService, never through a plugin.

    // Email OTP: 6-digit codes for password reset and email change. Codes are
    // stored hashed and expire in 10 min. The single sendVerificationOTP callback
    // routes each type to the shared @realm/auth copy via SES.
    emailOTP({
      otpLength: 6,
      expiresIn: 600,
      allowedAttempts: 5,
      storeOTP: "hashed",
      // Without this, /sign-in/email-otp CREATES an account for any address
      // that can receive a code — better-auth's email-otp route falls through
      // to createUser() when the address is unknown and this flag is unset.
      // It is a separate switch from emailAndPassword.disableSignUp, which
      // only covers /sign-up/email. Accounts here are provisioned by checkout
      // or by an admin; nothing may self-register.
      disableSignUp: true,
      changeEmail: { enabled: true, verifyCurrentEmail: true },
      sendVerificationOTP: async ({ email, otp, type }) => {
        await sendAuthOtp(email, otp, type);
      },
    }),
    // Admin user management — createUser and setUserPassword only. ban/unban,
    // removeUser and impersonation stay unmounted: users.status is the single sign-in
    // switch, softDelete is the only delete, and impersonation needs its own audit
    // story. No adminClient(): it would pull @realm/auth (server-only, not in
    // transpilePackages) into the browser bundle.
    adminPlugin({ ac, roles, defaultRole: Role.USER, adminRoles: [Role.ADMIN] }),
    // Client hierarchy: org = brand or franchise/shop, capped at 2 levels
    // (brand -> franchise/shop). The plugin's own schema option only takes
    // modelName/fields/additionalFields per-table — Task 3's tables already use
    // the plugin's default names, so only additionalFields is needed here.
    organizationPlugin({
      schema: {
        organization: {
          additionalFields: {
            clientCode: { type: "string", required: true },
            parentOrganizationId: { type: "string", required: false },
            region: { type: "string", required: false },
          },
        },
      },
      // Depth guard: reject creating an org whose parent is itself already a
      // franchise/shop (parentOrganizationId !== null). See
      // packages/auth/src/organization.ts assertHierarchyDepth.
      organizationHooks: {
        beforeCreateOrganization: async ({ organization: newOrg }) => {
          const parentId = (newOrg as { parentOrganizationId?: string | null }).parentOrganizationId ?? null;
          if (parentId) {
            const [parent] = await db
              .select({ id: organization.id, parentOrganizationId: organization.parentOrganizationId })
              .from(organization)
              .where(eq(organization.id, parentId))
              .limit(1);
            try {
              assertHierarchyDepth(parent ?? null);
            } catch (e) {
              throw new APIError("BAD_REQUEST", { message: e instanceof Error ? e.message : "Invalid parent organization" });
            }
          }
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
      // Login gate: only `active` accounts may get a session. Fires after the
      // credential/OTP check passes, so a deactivated/suspended/deleted user is
      // authenticated but denied a session. Existing sessions are additionally
      // re-checked in the Node getSession path (see requireAccountUser).
      create: {
        before: async (sess) => {
          const [u] = await db
            .select({ status: users.status, emailVerified: users.emailVerified })
            .from(users)
            .where(eq(users.id, BigInt(sess.userId as string)))
            .limit(1);
          if (u && u.status !== "active") {
            throw new APIError("FORBIDDEN", { message: "This account is not active. Contact support." });
          }
          // Verified-email gate. requireEmailVerification only covers
          // /sign-in/email; the emailOTP plugin's own sign-in route skips it.
          // Enforcing on session creation catches every method at once, including
          // any plugin added later.
          //
          // Safe against a lockout loop: every better-auth route that both
          // verifies and opens a session (/verify-email, /sign-in/email-otp,
          // /email-otp/reset-password) writes emailVerified BEFORE creating the
          // session, so the user is already verified by the time this runs.
          if (u && !u.emailVerified) {
            throw new APIError("FORBIDDEN", {
              message: "Verify your email address first — check your inbox for the link.",
            });
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

      if (ctx.path !== "/sign-in/email") return;

      const method = "email";
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
          const body = ctx.body as { email?: string } | undefined;
          const identifier = body?.email ?? "unknown";
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
