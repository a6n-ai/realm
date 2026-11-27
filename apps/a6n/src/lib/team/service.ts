import { atomic, newId, sqlNewId } from "@foundry/database";
import { sql } from "drizzle-orm";
import type { CrmDb } from "../../db/client";
import type { Actor } from "../auth/actor";
import { canGrant, listOrgRoles } from "../auth/membership";
import { MailUnavailableError, type InviteStatus, type Mailer } from "../mail/mailer";

// Relay's send refusals. Only these reach the UI as a reason; any other failure text stays in the log.
export const SEND_REFUSALS = ["no_default_sender", "sender_not_verified", "quota_exceeded", "workspace_suspended"] as const;
export type SendRefusal = (typeof SEND_REFUSALS)[number];
// Relay sent "no default sender" before the typed code; both spellings map to the code.
const asRefusal = (error: string): SendRefusal | undefined => SEND_REFUSALS.find((r) => r === error.trim().replaceAll(" ", "_"));

export type InviteResult =
  | { ok: true; sent: boolean; inviteLink: string; reason?: SendRefusal }
  | { ok: false; code: "already_active" | "mail_unavailable" | "not_found" | "invalid" | "unknown_role" | "role_not_grantable" };

export type ChangeRoleResult = { ok: true } | { ok: false; code: "not_found" | "unknown_role" | "role_not_grantable" | "last_owner" };

// The seed's system actor owns audit rows; it is never a team member.
const SYSTEM_ID = "usr_system";

export type RemoveResult =
  | { removed: true }
  | { removed: false; reason: "last_owner" | "self" | "already_removed" | "role_not_grantable" };

export type MemberRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  passwordSet: boolean;
  lastSignIn: number | null;
  openInquiries: number;
  latestInvite: { n: number; idempotencyKey: string; relayMessageId: string | null; sentAt: number | null } | null;
};

// Drizzle's D1 batch returns one D1Result per statement; meta.changes is that statement's row count.
const changed = (res: unknown): number => (res as { meta?: { changes?: number } })?.meta?.changes ?? 0;

const isUniqueConflict = (e: unknown): boolean => {
  for (let x = e as { message?: string; cause?: unknown } | undefined; x; x = x.cause as typeof x) {
    if (/UNIQUE/i.test(x.message ?? "")) return true;
  }
  return false;
};

const OWNER = "owner";
const hasOwner = (role: string) => role.split(",").map((r) => r.trim()).includes(OWNER);

// Bound to one organisation: members, invites and removals of another organisation are out of reach.
export function createTeamService(db: CrmDb, org: string, mailer: Mailer | (() => Mailer), authUrl: string) {
  const roleInfo = async (role: string) => {
    const roles = await listOrgRoles(db, org);
    const names = role.split(",").map((r) => r.trim()).filter(Boolean);
    const found = names.map((n) => roles.find((r) => r.name === n));
    return found.every(Boolean) && names.length > 0 ? found.flatMap((r) => r!.permissions) : null;
  };
  const memberRole = async (userId: string) =>
    (await db.all<{ role: string }>(sql`SELECT role FROM members WHERE organization_id = ${org} AND user_id = ${userId}`))[0]?.role ?? null;
  const ownerCount = sql`(SELECT count(*) FROM members WHERE organization_id = ${org} AND (',' || replace(role, ' ', '') || ',') LIKE '%,owner,%')`;
  // A thunk lets mailerFor(env) throw MailUnavailableError at call time, not at construction.
  const resolveMailer = (): Mailer | null => {
    try {
      return typeof mailer === "function" ? mailer() : mailer;
    } catch (e) {
      if (e instanceof MailUnavailableError) return null;
      throw e;
    }
  };
  const linkFor = (email: string) => `${authUrl.replace(/\/+$/, "")}/login?email=${encodeURIComponent(email)}&invited=1`;

  // Writes the next invites row for the user; n and the key come from SQL so concurrent calls differ.
  const insertInvite = async (userId: string, actor: Actor, id: string): Promise<number> => {
    const next = sql`(SELECT count(*) + 1 FROM invites WHERE user_id = u.id AND organization_id = ${org})`;
    const run = () =>
      db.run(sql`INSERT INTO invites (id, created_at, created_by, organization_id, user_id, invited_by, n, idempotency_key)
        SELECT ${id}, ${Date.now()}, ${actor.userId}, ${org}, u.id, ${actor.userId}, ${next}, 'invite:' || u.id || ':' || ${org} || ':' || ${next}
        FROM users u WHERE u.id = ${userId} AND u.status = 'active'
          AND EXISTS (SELECT 1 FROM members m WHERE m.user_id = u.id AND m.organization_id = ${org})`);
    const res = await run().catch((e) => (isUniqueConflict(e) ? run() : Promise.reject(e)));
    return changed(res);
  };

  const deliver = async (m: Mailer, email: string, actor: Actor, inviteId: string): Promise<InviteResult> => {
    const inviteLink = linkFor(email);
    const [row] = await db.all<{ key: string }>(sql`SELECT idempotency_key AS key FROM invites WHERE id = ${inviteId}`);
    let sent = false;
    let reason: SendRefusal | undefined;
    try {
      const r = await m.sendInvite(email, inviteLink, actor.name, row!.key);
      if (r.ok) {
        sent = true;
        await db.run(sql`UPDATE invites SET relay_message_id = ${r.messageId ?? null}, sent_at = ${Date.now()} WHERE id = ${inviteId}`);
      } else {
        // A refusal used to vanish here: the caller saw only sent: false and nothing was logged.
        console.error(`invite send refused: ${r.error ?? "unknown"}`);
        reason = asRefusal(r.error ?? "");
      }
    } catch (e) {
      console.error("invite send failed", e);
    }
    return reason ? { ok: true, sent, inviteLink, reason } : { ok: true, sent, inviteLink };
  };

  return {
    inviteLink: linkFor,

    // Only a pending (active, no password yet) member has a usable invite link.
    pendingLink: (m: Pick<MemberRow, "email" | "status" | "passwordSet">): string | null =>
      !m.passwordSet && m.status === "active" ? linkFor(m.email) : null,

    async invite(input: { email: string; name: string; role: string }, actor: Actor): Promise<InviteResult> {
      const email = input.email.trim().toLowerCase();
      const name = input.name.trim();
      const role = input.role.trim();
      const perms = await roleInfo(role);
      if (!perms) return { ok: false, code: "unknown_role" };
      if (!canGrant(actor.permissions, perms)) return { ok: false, code: "role_not_grantable" };
      const [sys] = await db.all<{ id: string }>(sql`SELECT id FROM users WHERE email = ${email} AND id = ${SYSTEM_ID}`);
      if (sys) return { ok: false, code: "invalid" };
      const m = resolveMailer();
      if (!m) return { ok: false, code: "mail_unavailable" };
      const now = Date.now();
      const inviteId = newId("inv");
      // One unit. The account is created, or reactivated when it was removed from the platform; an active account in
      // another organisation is kept as it is. The membership row decides: changes() = 0 means already a member here.
      const [, member, invite] = await atomic(db, () => [
        sql`INSERT INTO users (id, name, email, role, status, password_set, email_verified, created_at, updated_at)
          VALUES (${newId("usr")}, ${name}, ${email}, 'user', 'active', 0, 0, ${now}, ${now})
          ON CONFLICT(email) DO UPDATE SET name = excluded.name, status = 'active', password_set = 0, updated_at = ${now}
          WHERE users.status = 'removed' AND users.id <> ${SYSTEM_ID}`,
        sql`INSERT INTO members (id, organization_id, user_id, role, created_at)
          SELECT ${newId("mem")}, ${org}, u.id, ${role}, ${now} FROM users u
          WHERE u.email = ${email} AND u.status = 'active' AND u.id <> ${SYSTEM_ID}
            AND NOT EXISTS (SELECT 1 FROM members m WHERE m.user_id = u.id AND m.organization_id = ${org})`,
        {
          onlyIfPreviousChanged: 1,
          query: sql`INSERT INTO invites (id, created_at, created_by, organization_id, user_id, invited_by, n, idempotency_key)
            SELECT ${inviteId}, ${now}, ${actor.userId}, ${org}, u.id, ${actor.userId},
              (SELECT count(*) + 1 FROM invites WHERE user_id = u.id AND organization_id = ${org}),
              'invite:' || u.id || ':' || ${org} || ':' || (SELECT count(*) + 1 FROM invites WHERE user_id = u.id AND organization_id = ${org})
            FROM users u WHERE u.email = ${email}`,
        },
      ]);
      if (changed(member) === 0) return { ok: false, code: "already_active" };
      if (changed(invite) !== 1) return { ok: false, code: "not_found" };
      return deliver(m, email, actor, inviteId);
    },

    async changeRole(userId: string, role: string, actor: Actor): Promise<ChangeRoleResult> {
      const current = await memberRole(userId);
      if (current === null) return { ok: false, code: "not_found" };
      const next = await roleInfo(role.trim());
      const now = await roleInfo(current);
      if (!next) return { ok: false, code: "unknown_role" };
      if (!canGrant(actor.permissions, next) || !canGrant(actor.permissions, now ?? [])) return { ok: false, code: "role_not_grantable" };
      const keepsOwner = hasOwner(role);
      const [upd] = await atomic(db, () => [
        sql`UPDATE members SET role = ${role.trim()}
          WHERE organization_id = ${org} AND user_id = ${userId}
            AND (${keepsOwner ? 1 : 0} = 1 OR (',' || replace(role, ' ', '') || ',') NOT LIKE '%,owner,%' OR ${ownerCount} > 1)`,
        {
          onlyIfPreviousChanged: 1,
          query: sql`INSERT INTO audit_log (id, created_at, created_by, organization_id, action, actor_id, target, data)
            SELECT ${newId("aud")}, ${Date.now()}, ${actor.userId}, ${org}, 'member.role', ${actor.userId}, ${userId},
              json_object('from', ${current}, 'to', ${role.trim()})`,
        },
      ]);
      return changed(upd) === 1 ? { ok: true } : { ok: false, code: "last_owner" };
    },

    async resendInvite(userId: string, actor: Actor): Promise<InviteResult> {
      const m = resolveMailer();
      if (!m) return { ok: false, code: "mail_unavailable" };
      const [u] = await db.all<{ email: string }>(sql`SELECT u.email FROM users u
        JOIN members m ON m.user_id = u.id AND m.organization_id = ${org}
        WHERE u.id = ${userId} AND u.status = 'active'`);
      if (!u) return { ok: false, code: "not_found" };
      const inviteId = newId("inv");
      if ((await insertInvite(userId, actor, inviteId)) !== 1) return { ok: false, code: "not_found" };
      return deliver(m, u.email, actor, inviteId);
    },

    async inviteStatuses(userIds: string[]): Promise<Record<string, InviteStatus>> {
      if (userIds.length === 0) return {};
      const out: Record<string, InviteStatus> = {};
      const keys: Record<string, string> = {};
      // Chunked: D1 allows 100 bound parameters per statement.
      for (let i = 0; i < userIds.length; i += 90) {
        const chunk = userIds.slice(i, i + 90);
        const rows = await db.all<{ user_id: string; key: string; msg: string | null }>(
          sql`SELECT i.user_id, i.idempotency_key AS key, i.relay_message_id AS msg FROM invites i
            WHERE i.organization_id = ${org} AND i.user_id IN (${sql.join(chunk.map((id) => sql`${id}`), sql`, `)})
              AND i.n = (SELECT max(n) FROM invites WHERE user_id = i.user_id AND organization_id = ${org})`,
        );
        for (const r of rows) {
          if (r.msg) keys[r.key] = r.user_id;
          else out[r.user_id] = "failed";
        }
      }
      const m = resolveMailer();
      if (!m || Object.keys(keys).length === 0) return out;
      let statuses: Record<string, InviteStatus>;
      try {
        statuses = await m.statusByKeys(Object.keys(keys));
      } catch (e) {
        // A Relay outage must not take the team page (and its copy-link fallback) down with it.
        console.error("invite status lookup failed", e);
        statuses = Object.fromEntries(Object.keys(keys).map((k) => [k, "unknown" as const]));
      }
      for (const [key, status] of Object.entries(statuses)) if (keys[key]) out[keys[key]] = status;
      return out;
    },

    // Removing someone from this organisation deletes the membership and unassigns their open inquiries here. When it
    // was their last organisation, their account goes too (status removed, sessions, password and codes), as before.
    async remove(userId: string, actor: Actor): Promise<RemoveResult> {
      if (userId === actor.userId) return { removed: false, reason: "self" };
      const role = await memberRole(userId);
      if (role === null) return { removed: false, reason: "already_removed" };
      const perms = await roleInfo(role);
      if (!canGrant(actor.permissions, perms ?? [])) return { removed: false, reason: "role_not_grantable" };
      const [target] = await db.all<{ email: string }>(sql`SELECT email FROM users WHERE id = ${userId}`);
      const now = Date.now();
      const auditId = newId("aud");
      const mine = sql`EXISTS (SELECT 1 FROM audit_log WHERE id = ${auditId})`;
      const lastOrg = sql`NOT EXISTS (SELECT 1 FROM members WHERE user_id = ${userId})`;
      const e = target?.email ?? "";
      const [del] = await atomic(db, () => [
        sql`DELETE FROM members WHERE organization_id = ${org} AND user_id = ${userId}
          AND ((',' || replace(role, ' ', '') || ',') NOT LIKE '%,owner,%' OR ${ownerCount} > 1)`,
        {
          onlyIfPreviousChanged: 1,
          query: sql`INSERT INTO audit_log (id, created_at, created_by, organization_id, action, actor_id, target, data)
            SELECT ${auditId}, ${now}, ${actor.userId}, ${org}, 'team.remove', ${actor.userId}, ${userId}, json_object('email', ${e})`,
        },
        sql`INSERT INTO inquiry_activities (id, created_at, organization_id, inquiry_id, type, from_owner_id, to_owner_id, actor_id)
          SELECT ${sqlNewId("iac", "sqlite")}, ${now}, ${org}, id, 'reassigned', ${userId}, NULL, ${actor.userId}
          FROM inquiries WHERE organization_id = ${org} AND owner_id = ${userId} AND closed_at IS NULL AND ${mine}`,
        sql`UPDATE inquiries SET owner_id = NULL WHERE organization_id = ${org} AND owner_id = ${userId} AND closed_at IS NULL AND ${mine}`,
        sql`UPDATE users SET status = 'removed', updated_at = ${now} WHERE id = ${userId} AND ${mine} AND ${lastOrg}`,
        sql`DELETE FROM sessions WHERE user_id = ${userId} AND ${mine} AND ${lastOrg}`,
        sql`DELETE FROM accounts WHERE user_id = ${userId} AND provider_id = 'credential' AND ${mine} AND ${lastOrg}`,
        sql`DELETE FROM verifications WHERE identifier IN ('sign-in-otp-' || ${e}, 'email-verification-otp-' || ${e}, 'forget-password-otp-' || ${e}) AND ${mine} AND ${lastOrg}`,
      ]);
      if (changed(del) === 1) return { removed: true };
      return (await memberRole(userId)) === null ? { removed: false, reason: "already_removed" } : { removed: false, reason: "last_owner" };
    },

    async list(): Promise<MemberRow[]> {
      const rows = await db.all<{
        id: string; name: string; email: string; role: string; status: string; password_set: number;
        open: number; last_sign_in: number | null; n: number | null; key: string | null; msg: string | null; sent_at: number | null;
      }>(sql`SELECT u.id, u.name, u.email, m.role, u.status, u.password_set,
          (SELECT count(*) FROM inquiries WHERE organization_id = ${org} AND owner_id = u.id AND closed_at IS NULL) AS open,
          u.last_sign_in_at AS last_sign_in,
          i.n, i.idempotency_key AS key, i.relay_message_id AS msg, i.sent_at
        FROM members m
        JOIN users u ON u.id = m.user_id
        LEFT JOIN invites i ON i.user_id = u.id AND i.organization_id = ${org}
          AND i.n = (SELECT max(n) FROM invites WHERE user_id = u.id AND organization_id = ${org})
        WHERE m.organization_id = ${org}
        ORDER BY u.name, u.id`);
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.role,
        status: r.status,
        passwordSet: !!r.password_set,
        lastSignIn: r.last_sign_in === null ? null : Number(r.last_sign_in),
        openInquiries: Number(r.open),
        latestInvite: r.n === null ? null : { n: r.n, idempotencyKey: r.key!, relayMessageId: r.msg, sentAt: r.sent_at },
      }));
    },
  };
}

export type TeamService = ReturnType<typeof createTeamService>;
