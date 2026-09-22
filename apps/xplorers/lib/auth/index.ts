import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { admin as adminPlugin } from "better-auth/plugins/admin";
import { emailOTP } from "better-auth/plugins/email-otp";
import { createLogger } from "@foundry/commons/logger";
import { createOrganizationPlugin, authAuditAction } from "@foundry/auth";
import { ac, roles } from "./permissions";
import { Role } from "@foundry/commons";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { account, invitation, member, organization, session, users, verification } from "@/db/schema";
import { recordAudit } from "@/lib/services/session-service";
import { betterAuthPassword } from "./password";
import { sendAuthOtp, sendStaffInvitation } from "./security-events";

const log = createLogger("auth");
const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;

/**
 * Pure sign-in admission rule, split from the DB read so it is testable without
 * an auth instance. `status` is the only "cannot sign in" switch — role decides
 * where a session may go, never whether one may exist.
 */
export function decideSessionAdmission(
  row: { role: string; status: string } | undefined,
): { ok: true } | { ok: false; message: string } {
  if (!row) return { ok: true };
  if (row.status !== "active") {
    return { ok: false, message: "This account is not active. Contact an administrator." };
  }
  return { ok: true };
}

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
  appName: "Xplorers",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    // organization/member/invitation must be listed too — the organization plugin's
    // own endpoints (acceptInvitation, createInvitation, ...) resolve models through
    // this adapter, and an explicit `schema` here takes precedence over the db's own
    // full schema (see @better-auth/drizzle-adapter's getSchema: `config.schema ||
    // db._.fullSchema`), so an incomplete map throws "model not found" at call time.
    schema: { user: users, account, session, verification, organization, member, invitation },
  }),
  advanced: {
    database: { generateId: false },
    // Trust ONLY x-real-ip. The default is x-forwarded-for, whose leftmost
    // token better-auth takes verbatim — a client can prepend any value and
    // pick its own rate-limit bucket.
    ipAddress: { ipAddressHeaders: ["x-real-ip"] },
  },
  // Default in-memory rate-limit store. Correct for one instance; counters
  // reset on deploy. Move to `storage: "database"` (needs a rateLimit table
  // migration) if this app is ever scaled past a single process.
  //
  // cookieCache (compact, 5 min) skips a DB round-trip on getSession. User
  // additionalFields (role, publicId) are still on the cached user object via
  // parseUserOutput; session additionalFields are not. `getSession` still
  // requires publicId — if that ever goes missing on a cache hit, disable this.
  session: {
    expiresIn: SESSION_MAX_AGE_S,
    freshAge: 60 * 60,
    cookieCache: { enabled: true, strategy: "compact", maxAge: 5 * 60 },
  },
  emailAndPassword: {
    enabled: true,
    password: betterAuthPassword,
    // Family signup is a custom action (`signUpCustomer`), not Better Auth
    // `/sign-up/email`. Without this, anyone could POST themselves an account.
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 256,
    requireEmailVerification: false,
    revokeSessionsOnPasswordReset: true,
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
      platformRole: { type: "string", required: false, defaultValue: null, input: false },
    },
  },
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 600,
      allowedAttempts: 5,
      storeOTP: "hashed",
      // Separate switch from emailAndPassword.disableSignUp — without this,
      // `/sign-in/email-otp` creates a user for any mailbox that can receive a
      // code. Account creation stays the explicit, name-collecting signup action.
      disableSignUp: true,
      changeEmail: { enabled: true, verifyCurrentEmail: true },
      sendVerificationOTP: async ({ email, otp, type }) => {
        await sendAuthOtp(email, otp, type);
      },
    }),
    adminPlugin({ ac, roles, defaultRole: Role.USER, adminRoles: [Role.ADMIN] }),
    createOrganizationPlugin({
      db: db as unknown as Parameters<typeof createOrganizationPlugin>[0]["db"],
      organizationTable: organization,
      eq,
      allowUserToCreateOrganization: (user) => user.role !== Role.USER,
      sendInvitationEmail: async (data) => {
        const url = new URL(`/accept-invitation/${data.invitation.id}`, process.env.BETTER_AUTH_URL).toString();
        await sendStaffInvitation({ email: data.email, role: data.invitation.role, inviteUrl: url });
      },
    }),
    nextCookies(),
  ],
  databaseHooks: {
    session: {
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
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
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
