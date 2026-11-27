import { atomic, newId } from "@foundry/database";
import { sql } from "drizzle-orm";
import type { CrmDb } from "../../db/client";
import type { Actor } from "../auth/actor";

export type TeamRow = { id: string; name: string; members: { userId: string; name: string }[] };
export type TeamResult =
  | { ok: true; id?: string }
  | { ok: false; code: "invalid" | "name_taken" | "not_found" | "not_a_member" | "already_in_team" };

const changed = (res: unknown): number => (res as { meta?: { changes?: number } })?.meta?.changes ?? 0;
const clean = (name: string) => name.trim().replace(/\s+/g, " ");

// Better Auth's team tables, bound to one organisation. member_count is kept in step for the plugin.
export function createTeamsService(db: CrmDb, org: string) {
  const audit = (action: string, actor: Actor, target: string, data: Record<string, unknown>) => ({
    onlyIfPreviousChanged: 1 as const,
    query: sql`INSERT INTO audit_log (id, created_at, created_by, organization_id, action, actor_id, target, data)
      SELECT ${newId("aud")}, ${Date.now()}, ${actor.userId}, ${org}, ${action}, ${actor.userId}, ${target}, ${JSON.stringify(data)}`,
  });
  const recount = (teamId: string) =>
    sql`UPDATE teams SET member_count = (SELECT count(*) FROM team_members WHERE team_id = ${teamId}), updated_at = ${Date.now()}
      WHERE id = ${teamId}`;
  const inOrg = async (teamId: string) =>
    (await db.all<{ id: string }>(sql`SELECT id FROM teams WHERE id = ${teamId} AND organization_id = ${org}`)).length > 0;

  return {
    async list(): Promise<TeamRow[]> {
      const teams = await db.all<{ id: string; name: string }>(sql`SELECT id, name FROM teams WHERE organization_id = ${org} ORDER BY name, id`);
      const rows = await db.all<{ team_id: string; user_id: string; name: string }>(sql`
        SELECT tm.team_id, tm.user_id, u.name FROM team_members tm
        JOIN teams t ON t.id = tm.team_id AND t.organization_id = ${org}
        JOIN users u ON u.id = tm.user_id ORDER BY u.name`);
      return teams.map((t) => ({ ...t, members: rows.filter((r) => r.team_id === t.id).map((r) => ({ userId: r.user_id, name: r.name })) }));
    },

    async create(name: string, actor: Actor): Promise<TeamResult> {
      const n = clean(name);
      if (!n || n.length > 64) return { ok: false, code: "invalid" };
      const id = newId("tea");
      const [ins] = await atomic(db, () => [
        sql`INSERT INTO teams (id, name, organization_id, member_count, created_at)
          SELECT ${id}, ${n}, ${org}, 0, ${Date.now()}
          WHERE NOT EXISTS (SELECT 1 FROM teams WHERE organization_id = ${org} AND lower(name) = lower(${n}))`,
        audit("team.create", actor, id, { name: n }),
      ]);
      return changed(ins) === 1 ? { ok: true, id } : { ok: false, code: "name_taken" };
    },

    async rename(id: string, name: string, actor: Actor): Promise<TeamResult> {
      const n = clean(name);
      if (!n || n.length > 64) return { ok: false, code: "invalid" };
      if (!(await inOrg(id))) return { ok: false, code: "not_found" };
      const [upd] = await atomic(db, () => [
        sql`UPDATE teams SET name = ${n}, updated_at = ${Date.now()} WHERE id = ${id} AND organization_id = ${org}
          AND NOT EXISTS (SELECT 1 FROM teams WHERE organization_id = ${org} AND id <> ${id} AND lower(name) = lower(${n}))`,
        audit("team.rename", actor, id, { name: n }),
      ]);
      return changed(upd) === 1 ? { ok: true } : { ok: false, code: "name_taken" };
    },

    async remove(id: string, actor: Actor): Promise<TeamResult> {
      const [del] = await atomic(db, () => [
        sql`DELETE FROM teams WHERE id = ${id} AND organization_id = ${org}`,
        audit("team.delete", actor, id, {}),
      ]);
      return changed(del) === 1 ? { ok: true } : { ok: false, code: "not_found" };
    },

    async addMember(teamId: string, userId: string, actor: Actor): Promise<TeamResult> {
      if (!(await inOrg(teamId))) return { ok: false, code: "not_found" };
      const [member] = await db.all<{ id: string }>(sql`SELECT id FROM members WHERE organization_id = ${org} AND user_id = ${userId}`);
      if (!member) return { ok: false, code: "not_a_member" };
      const [ins] = await atomic(db, () => [
        sql`INSERT INTO team_members (id, team_id, user_id, created_at)
          SELECT ${newId("tmm")}, ${teamId}, ${userId}, ${Date.now()}
          WHERE NOT EXISTS (SELECT 1 FROM team_members WHERE team_id = ${teamId} AND user_id = ${userId})`,
        audit("team.add_member", actor, teamId, { userId }),
        recount(teamId),
      ]);
      return changed(ins) === 1 ? { ok: true } : { ok: false, code: "already_in_team" };
    },

    async removeMember(teamId: string, userId: string, actor: Actor): Promise<TeamResult> {
      if (!(await inOrg(teamId))) return { ok: false, code: "not_found" };
      const [del] = await atomic(db, () => [
        sql`DELETE FROM team_members WHERE team_id = ${teamId} AND user_id = ${userId}`,
        audit("team.remove_member", actor, teamId, { userId }),
        recount(teamId),
      ]);
      return changed(del) === 1 ? { ok: true } : { ok: false, code: "not_found" };
    },
  };
}
