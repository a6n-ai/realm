import { and, desc, eq } from "drizzle-orm";
import type { CrmDb } from "../../db/client";
import { members, organizationRoles, organizations } from "../../db/schema";
import { builtInPermissions, isBuiltInRole, permissionsOf, type OrgPermission, type Statements } from "./permissions";

export type Membership = { organizationId: string; organizationName: string; role: string; permissions: OrgPermission[] };

/** Every role in a member row (Better Auth allows "a,b"), built-in or custom, unioned into one permission set. */
export async function permissionsFor(db: CrmDb, organizationId: string, role: string): Promise<OrgPermission[]> {
  const out = new Set<OrgPermission>();
  for (const name of role.split(",").map((r) => r.trim()).filter(Boolean)) {
    if (isBuiltInRole(name)) {
      for (const p of builtInPermissions(name)) out.add(p);
      continue;
    }
    const [row] = await db
      .select({ permission: organizationRoles.permission })
      .from(organizationRoles)
      .where(and(eq(organizationRoles.organizationId, organizationId), eq(organizationRoles.role, name)));
    if (row) for (const p of permissionsOf(JSON.parse(row.permission) as Statements)) out.add(p);
  }
  return [...out].sort();
}

/** The person's organisations, newest membership first. */
export async function listMemberships(db: CrmDb, userId: string) {
  return db
    .select({ organizationId: members.organizationId, organizationName: organizations.name, role: members.role })
    .from(members)
    .innerJoin(organizations, eq(organizations.id, members.organizationId))
    .where(eq(members.userId, userId))
    .orderBy(desc(members.createdAt));
}

/**
 * The membership for the session's active organisation. A stale or missing active organisation (removed from it, or a
 * session older than the membership) falls back to the newest membership, as sign-in does. Null: no organisation.
 */
export async function resolveMembership(db: CrmDb, userId: string, activeOrganizationId: string | null): Promise<Membership | null> {
  const all = await listMemberships(db, userId);
  const m = all.find((x) => x.organizationId === activeOrganizationId) ?? all[0];
  if (!m) return null;
  return { ...m, permissions: await permissionsFor(db, m.organizationId, m.role) };
}
