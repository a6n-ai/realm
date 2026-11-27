import { atomic, newId, sqlNewId } from "@foundry/database";
import { sql } from "drizzle-orm";
import type { CrmDb } from "../../db/client";
import type { Actor } from "../auth/actor";
import { MailUnavailableError, type InviteStatus, type Mailer } from "../mail/mailer";

export type InviteResult =
  | { ok: true; sent: boolean; inviteLink: string }
  | { ok: false; code: "already_active" | "mail_unavailable" | "not_found" };

export type RemoveResult = { removed: true } | { removed: false; reason: "last_admin" | "self" | "already_removed" };

export type MemberRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  passwordSet: boolean;
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

export function createTeamService(db: CrmDb, mailer: Mailer | (() => Mailer), authUrl: string) {
  // A thunk lets mailerFor(env) throw MailUnavailableError at call time, not at construction.
  const resolveMailer = (): Mailer | null => {
    try {
      return typeof mailer === "function" ? mailer() : mailer;
    } catch (e) {
      if (e instanceof MailUnavailableError) return null;
      throw e;
    }
  };
  const linkFor = (email: string) => `${authUrl}/login?email=${encodeURIComponent(email)}&invited=1`;

  // Writes the next invites row for the user; n and the key come from SQL so concurrent calls differ.
  const insertInvite = async (userId: string, actor: Actor, id: string): Promise<number> => {
    const next = sql`(SELECT count(*) + 1 FROM invites WHERE user_id = u.id)`;
    const run = () =>
      db.run(sql`INSERT INTO invites (id, created_at, created_by, user_id, invited_by, n, idempotency_key)
        SELECT ${id}, ${Date.now()}, ${actor.userId}, u.id, ${actor.userId}, ${next}, 'invite:' || u.id || ':' || ${next}
        FROM users u WHERE u.id = ${userId} AND u.status = 'active'`);
    const res = await run().catch((e) => (isUniqueConflict(e) ? run() : Promise.reject(e)));
    return changed(res);
  };

  const deliver = async (m: Mailer, email: string, actor: Actor, inviteId: string): Promise<InviteResult> => {
    const inviteLink = linkFor(email);
    const [row] = await db.all<{ key: string }>(sql`SELECT idempotency_key AS key FROM invites WHERE id = ${inviteId}`);
    let sent = false;
    try {
      const r = await m.sendInvite(email, inviteLink, actor.name, row!.key);
      if (r.ok) {
        sent = true;
        await db.run(sql`UPDATE invites SET relay_message_id = ${r.messageId ?? null}, sent_at = ${Date.now()} WHERE id = ${inviteId}`);
      }
    } catch (e) {
      console.error("invite send failed", e);
    }
    return { ok: true, sent, inviteLink };
  };

  return {
    async invite(input: { email: string; name: string }, actor: Actor): Promise<InviteResult> {
      const email = input.email.trim().toLowerCase();
      const name = input.name.trim();
      const m = resolveMailer();
      if (!m) return { ok: false, code: "mail_unavailable" };
      const [existing] = await db.all<{ status: string }>(sql`SELECT status FROM users WHERE email = ${email}`);
      if (existing?.status === "active") return { ok: false, code: "already_active" };

      const now = Date.now();
      const inviteId = newId("inv");
      // Insert, or reactivate a removed row; an active row is left alone (changes() = 0), so the invite insert is skipped.
      await atomic(db, () => [
        sql`INSERT INTO users (id, name, email, role, status, password_set, email_verified, created_at, updated_at)
          VALUES (${newId("usr")}, ${name}, ${email}, 'sales', 'active', 0, 0, ${now}, ${now})
          ON CONFLICT(email) DO UPDATE SET name = excluded.name, role = 'sales', status = 'active', password_set = 0, updated_at = ${now}
          WHERE users.status = 'removed'`,
      ]);
      const [u] = await db.all<{ id: string }>(sql`SELECT id FROM users WHERE email = ${email} AND status = 'active'`);
      if (!u || (await insertInvite(u.id, actor, inviteId)) !== 1) return { ok: false, code: "already_active" };
      return deliver(m, email, actor, inviteId);
    },

    async resendInvite(userId: string, actor: Actor): Promise<InviteResult> {
      const m = resolveMailer();
      if (!m) return { ok: false, code: "mail_unavailable" };
      const [u] = await db.all<{ email: string }>(sql`SELECT email FROM users WHERE id = ${userId} AND status = 'active'`);
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
            WHERE i.user_id IN (${sql.join(chunk.map((id) => sql`${id}`), sql`, `)})
              AND i.n = (SELECT max(n) FROM invites WHERE user_id = i.user_id)`,
        );
        for (const r of rows) {
          if (r.msg) keys[r.key] = r.user_id;
          else out[r.user_id] = "failed";
        }
      }
      const m = resolveMailer();
      if (!m || Object.keys(keys).length === 0) return out;
      const statuses = await m.statusByKeys(Object.keys(keys));
      for (const [key, status] of Object.entries(statuses)) if (keys[key]) out[keys[key]] = status;
      return out;
    },

    async remove(userId: string, actor: Actor): Promise<RemoveResult> {
      const [target] = await db.all<{ email: string; role: string; status: string }>(
        sql`SELECT email, role, status FROM users WHERE id = ${userId}`,
      );
      if (!target) return { removed: false, reason: "already_removed" };
      const now = Date.now();
      // updated_at = now marks "this batch's step 1 changed the row", so a repeat removal cannot re-run steps 2-5.
      // shortcut: two removals of one user in the same millisecond could both pass; the second audit row is the only effect.
      const removedByMe = sql`EXISTS (SELECT 1 FROM users WHERE id = ${userId} AND status = 'removed' AND updated_at = ${now})`;
      const [upd] = await atomic(db, () => [
        sql`UPDATE users SET status = 'removed', updated_at = ${now}
          WHERE id = ${userId} AND status = 'active' AND id <> ${actor.userId}
            AND (role <> 'admin' OR (SELECT count(*) FROM users WHERE role = 'admin' AND status = 'active') > 1)`,
        sql`INSERT INTO inquiry_activities (id, created_at, inquiry_id, type, from_owner_id, to_owner_id, actor_id)
          SELECT ${sqlNewId("iac", "sqlite")}, ${now}, id, 'reassigned', ${userId}, NULL, ${actor.userId}
          FROM inquiries WHERE owner_id = ${userId} AND closed_at IS NULL AND ${removedByMe}`,
        sql`UPDATE inquiries SET owner_id = NULL WHERE owner_id = ${userId} AND closed_at IS NULL AND ${removedByMe}`,
        sql`DELETE FROM sessions WHERE user_id = ${userId} AND ${removedByMe}`,
        sql`DELETE FROM accounts WHERE user_id = ${userId} AND provider_id = 'credential' AND ${removedByMe}`,
        sql`DELETE FROM verifications WHERE substr(identifier, -length(${target.email})) = ${target.email} AND ${removedByMe}`,
        sql`INSERT INTO audit_log (id, created_at, created_by, action, actor_id, target, data)
          SELECT ${newId("aud")}, ${now}, ${actor.userId}, 'team.remove', ${actor.userId}, ${userId}, json_object('email', ${target.email})
          WHERE ${removedByMe}`,
      ]);
      if (changed(upd) === 1) return { removed: true };
      const [now1] = await db.all<{ status: string }>(sql`SELECT status FROM users WHERE id = ${userId}`);
      if (now1?.status !== "active") return { removed: false, reason: "already_removed" };
      return { removed: false, reason: userId === actor.userId ? "self" : "last_admin" };
    },

    async list(): Promise<MemberRow[]> {
      const rows = await db.all<{
        id: string; name: string; email: string; role: string; status: string; password_set: number;
        open: number; n: number | null; key: string | null; msg: string | null; sent_at: number | null;
      }>(sql`SELECT u.id, u.name, u.email, u.role, u.status, u.password_set,
          (SELECT count(*) FROM inquiries WHERE owner_id = u.id AND closed_at IS NULL) AS open,
          i.n, i.idempotency_key AS key, i.relay_message_id AS msg, i.sent_at
        FROM users u LEFT JOIN invites i ON i.user_id = u.id AND i.n = (SELECT max(n) FROM invites WHERE user_id = u.id)
        ORDER BY u.name, u.id`);
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        role: r.role,
        status: r.status,
        passwordSet: !!r.password_set,
        openInquiries: Number(r.open),
        latestInvite: r.n === null ? null : { n: r.n, idempotencyKey: r.key!, relayMessageId: r.msg, sentAt: r.sent_at },
      }));
    },
  };
}

export type TeamService = ReturnType<typeof createTeamService>;
