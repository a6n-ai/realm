"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { ValidationError } from "@foundry/commons";
import type { PermissionMap } from "@foundry/crm";
import { db } from "@/db/client";
import { organizationRole } from "@/db/schema";
import type { ActionResult } from "@/lib/actions/action-result";
import { staffAction } from "@/lib/actions/staff-action";
import { authApi, orgRoleApi } from "@/lib/auth/org-role-api";
import { orgRoles } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/session";
import { recordAudit } from "@/lib/identity/audit";
import { userIdByPublicId } from "@/lib/identity/user-ids";
import { getRoleHolderCounts } from "@/lib/services/organizations.service";

const ROLES = "/dashboard/organization/roles";
const ROLE_NAME = /^[a-z0-9-]{1,40}$/;

async function actingContext() {
  const session = await getSession();
  const organizationId = session?.session.activeOrganizationId;
  if (!session || !organizationId) throw new ValidationError("Select an organization first.");
  return { organizationId, actorId: await userIdByPublicId(session.user.id) };
}

function checkName(raw: string): string {
  const name = raw.trim();
  if (!ROLE_NAME.test(name)) throw new ValidationError("Use 1-40 lowercase letters, digits or hyphens.");
  if (Object.hasOwn(orgRoles, name)) throw new ValidationError(`"${name}" is a built-in role. Choose another name.`);
  return name;
}

async function findRole(organizationId: string, roleId: string) {
  const [row] = await db
    .select({ id: organizationRole.id, role: organizationRole.role })
    .from(organizationRole)
    .where(and(eq(organizationRole.id, roleId), eq(organizationRole.organizationId, organizationId)))
    .limit(1);
  if (!row) throw new ValidationError("Role not found.");
  return row;
}

const holders = (n: number) => `${n} member${n === 1 ? "" : "s"}`;

export async function createRole(input: { name: string; permission: PermissionMap }): Promise<ActionResult> {
  return staffAction({ guard: { ac: ["create"] }, revalidate: [ROLES] }, async () => {
    const { organizationId, actorId } = await actingContext();
    const name = checkName(input.name);
    const { roleData } = await authApi(async () =>
      orgRoleApi.createOrgRole({
        headers: await headers(),
        body: { role: name, permission: input.permission, organizationId },
      }),
    );
    await recordAudit({
      entity: "org_role",
      entityPublicId: roleData.id,
      operation: "create",
      changes: { organizationId, name, permission: input.permission },
      createdBy: actorId,
    });
  });
}

export async function updateRole(roleId: string, input: { name?: string; permission: PermissionMap }): Promise<ActionResult> {
  return staffAction({ guard: { ac: ["update"] }, revalidate: [ROLES] }, async () => {
    const { organizationId, actorId } = await actingContext();
    const current = await findRole(organizationId, roleId);
    const rename = input.name !== undefined && input.name.trim() !== current.role ? checkName(input.name) : undefined;
    if (rename) {
      // Better Auth renames the role row only; member rows would keep the old name and lose their access.
      const count = (await getRoleHolderCounts(organizationId))[current.role] ?? 0;
      if (count > 0) throw new ValidationError(`${holders(count)} still have this role, so it can't be renamed.`);
    }
    await authApi(async () =>
      orgRoleApi.updateOrgRole({
        headers: await headers(),
        body: { roleId, organizationId, data: { permission: input.permission, ...(rename ? { roleName: rename } : {}) } },
      }),
    );
    await recordAudit({
      entity: "org_role",
      entityPublicId: roleId,
      operation: "update",
      changes: { organizationId, name: { from: current.role, to: rename ?? current.role }, permission: input.permission },
      createdBy: actorId,
    });
  });
}

export async function deleteRole(roleId: string): Promise<ActionResult> {
  return staffAction({ guard: { ac: ["delete"] }, revalidate: [ROLES] }, async () => {
    const { organizationId, actorId } = await actingContext();
    const current = await findRole(organizationId, roleId);
    const count = (await getRoleHolderCounts(organizationId))[current.role] ?? 0;
    if (count > 0) throw new ValidationError(`${holders(count)} still ${count === 1 ? "has" : "have"} this role`);
    await authApi(async () =>
      orgRoleApi.deleteOrgRole({ headers: await headers(), body: { roleId, organizationId } }),
    );
    await recordAudit({
      entity: "org_role",
      entityPublicId: roleId,
      operation: "delete",
      changes: { organizationId, name: current.role },
      createdBy: actorId,
    });
  });
}
