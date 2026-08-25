import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin as adminPlugin, emailOTP, organization as organizationPlugin } from "better-auth/plugins";
import { createLogger } from "@realm/commons/logger";
import { assertHierarchyDepth, authAuditAction } from "@realm/auth";
import { ac, roles } from "./permissions";
import { orderTracking } from "@realm/order-tracking";
import { resolveTrackingSubject } from "@/lib/order-tracking/subject";
import { Role } from "@realm/commons";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { account, organization, session, users, verification } from "@/db/schema";
import { recordAudit } from "@/lib/services/session-service";
import { betterAuthPassword } from "./password";
import { sendAuthOtp } from "./security-events";

const log = createLogger("auth");
const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;

/**
 * Pure sign-in admission rule, split from the DB read so it is testable without
 * an auth instance. `status` is the only "cannot sign in" switch — role decides
 * where a session may go, never whether one may exist. Customers (`role: "user"`)
 * are provisioned by checkout and sign in by OTP; the dashboard layout is what
 * keeps them out of staff surfaces.
 */
export function decideSessionAdmission(
  row: { role: string; status: string } | undefined,
): { ok: true } | { ok: false; message: string } {
  // A missing row means the lookup raced a delete, not that access is denied;
  // better-auth has already verified the credential by this point.
  if (!row) return { ok: true };
  if (row.status !== "active") {
    return { ok: false, message: "This account is not active. Contact an administrator." };
  }
  return { ok: true };
}

/**
 * Sign-in gate. Runs after the credential check but before a session row is
 * written, so it covers every sign-in method at once rather than each route
 * separately. Exported for tests.
 */
export async function assertSessionAllowed(userId: bigint): Promise<void> {
  const [u] = await db
    .select({ status: users.status, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const decision = decideSessionAdmission(u);
  if (!decision.ok) throw new APIError("FORBIDDEN", { message: decision.message });
}

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
    // An invited account starts with passwordSet=false and no credential. Completing
    // the OTP reset IS choosing a password, so clear the flag here — otherwise the
    // dashboard layout keeps bouncing them to /set-password forever. onPasswordReset
    // is better-auth's own hook for this; no ctx.path matching required.
    onPasswordReset: async ({ user }) => {
      try {
        await db.update(users).set({ passwordSet: true }).where(eq(users.id, BigInt(user.id)));
      } catch (e) {
        log.error({ err: e }, "passwordSet flip after reset failed");
      }
    },
  },
  user: {
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
    // Public order tracking. Guests exchange the last 4 digits of the phone on
    // the order for a signed, order-scoped grant cookie; logged-in owners skip
    // the PIN. Deliberately not the anonymous plugin — that would mint a user
    // row per guest into a table this app surfaces in admin listings.
    orderTracking({ resolve: resolveTrackingSubject }),
    // Email OTP: 6-digit codes. Password reset for staff, and the primary
    // sign-in path for customers. Codes are stored hashed and expire in 10 min.
    // sendVerificationOTP routes the code via SES.
    emailOTP({
      otpLength: 6,
      expiresIn: 600,
      allowedAttempts: 5,
      storeOTP: "hashed",
      // WITHOUT this, /sign-in/email-otp CREATES an account for any address that
      // can receive a code (better-auth email-otp routes: "if (!user) { if
      // (opts.disableSignUp) throw …; createUser(…) }"). That is a separate
      // switch from emailAndPassword.disableSignUp above, which only covers
      // /sign-up/email — so any stranger's gmail could self-register a `user`
      // row and land on /me. Sign-in is now strictly "prove you hold the mailbox
      // of an account that already exists"; account creation is an explicit,
      // rate-limited, name-collecting step (POST /api/account/signup).
      disableSignUp: true,
      changeEmail: { enabled: true, verifyCurrentEmail: true },
      sendVerificationOTP: async ({ email, otp, type }) => {
        await sendAuthOtp(email, otp, type);
      },
    }),
    // Admin user management. Only createUser / setUserPassword / userHasPermission /
    // the session endpoints are called from this app.
    //
    // Deliberately unused:
    //   banUser / unbanUser — users.status is the single "cannot sign in" switch
    //     (see session.create.before below). A second flag would drift out of sync.
    //   removeUser        — hard delete; orders and payments reference these rows.
    //                       usersService.softDelete is the supported path.
    //   impersonateUser   — needs its own audit story before it is safe in a CRM
    //                       holding customer PII.
    // No adminClient() on the browser side: it would need `ac`/`roles`, which live in
    // @realm/auth — a server-only package that is not in transpilePackages.
    // defaultRole is Role.USER, which this app's `roles` map deliberately omits, so a
    // caller whose role is somehow missing authorizes as nothing. MEMBER here would be
    // fail-OPEN — better-auth falls back to defaultRole when a session carries no role,
    // and member holds order:write and finance:read. Unreachable while users.role is
    // NOT NULL, but it sits next to a roleCan() that fails closed and should agree with
    // it. This is NOT the creation default: a row created without a role becomes a
    // user, via the column default and user.additionalFields above — both Role.USER too.
    adminPlugin({ ac, roles, defaultRole: Role.USER, adminRoles: [Role.ADMIN] }),
    // Client hierarchy: org = brand or franchise/shop, capped at 2 levels
    // (brand -> franchise/shop).
    organizationPlugin({
      // Default is `true` (any authenticated user) — restrict org creation to
      // staff. Customers (Role.USER) hold no member row by design; letting them
      // create orgs would let any signed-in customer mint org/member rows.
      allowUserToCreateOrganization: async (user) => (user as { role?: string }).role !== Role.USER,
      schema: {
        organization: {
          modelName: "organization",
          additionalFields: {
            clientCode: { type: "string", required: true },
            // Not settable through create/update input (matches platformRole above).
            // Brand + franchise orgs are DB-seeded (db/seed-brand-org.ts); a future
            // franchise-creation flow would need to write this server-side.
            parentOrganizationId: { type: "string", required: false, input: false },
            region: { type: "string", required: false },
          },
        },
        member: { modelName: "member" },
        invitation: { modelName: "invitation" },
      },
      // Depth guard: reject creating an org whose parent is itself already a
      // franchise/shop (parentOrganizationId !== null). See
      // packages/auth/src/organization.ts assertHierarchyDepth. Unreachable via the
      // public API today since parentOrganizationId is input:false above; kept so a
      // future franchise-creation flow that writes it server-side still gets the
      // check for free.
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
          await assertSessionAllowed(BigInt(sess.userId as string));
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
