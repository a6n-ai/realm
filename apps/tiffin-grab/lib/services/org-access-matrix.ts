import { eq } from "drizzle-orm";
import type { AccessRow } from "@foundry/crm";
import { db } from "@/db/client";
import { member, organizationRole, users } from "@/db/schema";
import { requirePermissionIn } from "@/lib/auth/guards";
import { resolveMemberAccess } from "@/lib/auth/org-access";
import type { Permissions } from "@foundry/auth";

export type AccessMatrix = {
  rows: AccessRow[];
  platformAdmins: { name: string; email: string }[];
  /** Member ids whose role list resolves to nothing (empty, or only deleted custom roles). */
  noRole: string[];
};

/** One org's who-has-what, resolved with the same function the guards use. */
export async function getOrgAccessMatrix(organizationId: string): Promise<AccessMatrix> {
  await requirePermissionIn(organizationId, { member: ["update"] });
  const members = await db
    .select({ id: member.id, role: member.role, name: users.name, email: users.email })
    .from(member)
    .innerJoin(users, eq(users.id, member.userId))
    .where(eq(member.organizationId, organizationId));
  const customRows = await db
    .select({ role: organizationRole.role, permission: organizationRole.permission })
    .from(organizationRole)
    .where(eq(organizationRole.organizationId, organizationId));
  const customRoles: Record<string, Permissions> = {};
  for (const r of customRows) customRoles[r.role] = JSON.parse(r.permission) as Permissions;
  const admins = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.platformRole, "super_admin"));

  const rows: AccessRow[] = [];
  const noRole: string[] = [];
  for (const m of members) {
    const access = resolveMemberAccess(m.role, customRoles);
    if (access.roles.length === 0) noRole.push(m.id);
    rows.push({
      id: m.id,
      name: m.name ?? m.email,
      email: m.email,
      roles: access.roles,
      permissions: access.permissions,
      grants: access.grants,
    });
  }
  return {
    rows,
    platformAdmins: admins.map((a) => ({ name: a.name ?? a.email, email: a.email })),
    noRole,
  };
}
