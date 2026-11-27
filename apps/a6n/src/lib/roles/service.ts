import { atomic, newId } from "@foundry/database";
import { sql } from "drizzle-orm";
import type { CrmDb } from "../../db/client";
import type { Actor } from "../auth/actor";
import { canGrant, listOrgRoles } from "../auth/membership";
import { isBuiltInRole, isPermission, type OrgPermission } from "../auth/permissions";

export type RoleRow = { name: string; builtIn: boolean; permissions: OrgPermission[]; memberCount: number };
export type RoleResult = { ok: true } | { ok: false; code: "invalid" | "builtin_role" | "name_taken" | "role_not_grantable" | "role_in_use" | "not_found" };

const NAME = /^[a-z][a-z0-9_-]{1,31}$/;
const changed = (res: unknown): number => (res as { meta?: { changes?: number } })?.meta?.changes ?? 0;

// Better Auth's organizationRole row format: permission is JSON { resource: actions[] }, so the plugin and our own
// permission resolver read the same thing.
const toStatements = (perms: OrgPermission[]) => {
  const out: Record<string, string[]> = {};
  for (const p of perms) {
    const [r, a] = p.split(":") as [string, string];
    (out[r] ??= []).push(a);
  }
  return JSON.stringify(out);
};
const holders = (org: string, name: string) =>
  sql`(SELECT count(*) FROM members WHERE organization_id = ${org} AND (',' || replace(role, ' ', '') || ',') LIKE ${`%,${name},%`})`;

export function createRolesService(db: CrmDb, org: string) {
  const check = (name: string, permissions: string[], actor: Actor): RoleResult | null => {
    if (isBuiltInRole(name)) return { ok: false, code: "builtin_role" };
    if (!NAME.test(name) || permissions.length === 0 || !permissions.every(isPermission)) return { ok: false, code: "invalid" };
    if (!canGrant(actor.permissions, permissions as OrgPermission[])) return { ok: false, code: "role_not_grantable" };
    return null;
  };
  return {
    async list(): Promise<RoleRow[]> {
      const roles = await listOrgRoles(db, org);
      return Promise.all(
        roles.map(async (r) => {
          const [row] = await db.all<{ n: number }>(sql`SELECT ${holders(org, r.name)} AS n`);
          return { ...r, memberCount: Number(row?.n ?? 0) };
        }),
      );
    },

    async create(name: string, permissions: string[], actor: Actor): Promise<RoleResult> {
      const refused = check(name, permissions, actor);
      if (refused) return refused;
      const now = Date.now();
      const [ins] = await atomic(db, () => [
        sql`INSERT INTO organization_roles (id, organization_id, role, permission, created_at)
          SELECT ${newId("orl")}, ${org}, ${name}, ${toStatements(permissions as OrgPermission[])}, ${now}
          WHERE NOT EXISTS (SELECT 1 FROM organization_roles WHERE organization_id = ${org} AND role = ${name})`,
        { onlyIfPreviousChanged: 1, query: sql`INSERT INTO audit_log (id, created_at, created_by, organization_id, action, actor_id, target, data)
          SELECT ${newId("aud")}, ${now}, ${actor.userId}, ${org}, 'role.create', ${actor.userId}, ${name}, ${JSON.stringify({ permissions })}` },
      ]);
      return changed(ins) === 1 ? { ok: true } : { ok: false, code: "name_taken" };
    },

    async update(name: string, permissions: string[], actor: Actor): Promise<RoleResult> {
      const refused = check(name, permissions, actor);
      if (refused) return refused;
      const [current] = await db.all<{ permission: string }>(
        sql`SELECT permission FROM organization_roles WHERE organization_id = ${org} AND role = ${name}`,
      );
      if (!current) return { ok: false, code: "not_found" };
      const [upd] = await atomic(db, () => [
        sql`UPDATE organization_roles SET permission = ${toStatements(permissions as OrgPermission[])}, updated_at = ${Date.now()}
          WHERE organization_id = ${org} AND role = ${name}`,
        { onlyIfPreviousChanged: 1, query: sql`INSERT INTO audit_log (id, created_at, created_by, organization_id, action, actor_id, target, data)
          SELECT ${newId("aud")}, ${Date.now()}, ${actor.userId}, ${org}, 'role.update', ${actor.userId}, ${name}, ${JSON.stringify({ permissions })}` },
      ]);
      return changed(upd) === 1 ? { ok: true } : { ok: false, code: "not_found" };
    },

    async remove(name: string, actor: Actor): Promise<RoleResult> {
      if (isBuiltInRole(name)) return { ok: false, code: "builtin_role" };
      const [row] = await db.all<{ n: number }>(sql`SELECT ${holders(org, name)} AS n`);
      if (Number(row?.n ?? 0) > 0) return { ok: false, code: "role_in_use" };
      const [del] = await atomic(db, () => [
        sql`DELETE FROM organization_roles WHERE organization_id = ${org} AND role = ${name} AND ${holders(org, name)} = 0`,
        { onlyIfPreviousChanged: 1, query: sql`INSERT INTO audit_log (id, created_at, created_by, organization_id, action, actor_id, target, data)
          SELECT ${newId("aud")}, ${Date.now()}, ${actor.userId}, ${org}, 'role.delete', ${actor.userId}, ${name}, '{}'` },
      ]);
      return changed(del) === 1 ? { ok: true } : { ok: false, code: "not_found" };
    },
  };
}
