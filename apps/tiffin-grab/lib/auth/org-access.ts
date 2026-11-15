import { cache } from "react";
import { AuthError } from "@foundry/commons";
import { resolveOrgAccess, type OrgAccess, type Permissions } from "@foundry/auth";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { member, organizationRole } from "@/db/schema";
import { userIdByPublicId } from "@/lib/identity/user-ids";
import { ac, orgRoles } from "./permissions";
import { getSession } from "./session";

/** Access in one specific org: the caller's own member row there, never the active org's. */
export const getOrgAccessFor = cache(async (organizationId: string): Promise<OrgAccess> => {
  const session = await getSession();
  if (!session) throw new AuthError();
  const base = {
    platformRole: session.user.platformRole,
    userId: session.user.id,
    organizationId,
    roles: orgRoles,
    ac,
  };
  if (session.user.platformRole === "super_admin") {
    return resolveOrgAccess({ ...base, memberRole: null, customRoles: {} });
  }
  const dbUserId = await userIdByPublicId(session.user.id);
  if (!dbUserId) return { kind: "none" };
  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, dbUserId)));
  if (!row) return { kind: "none" };
  const memberRole = row.role;
  const custom = memberRole
    .split(",")
    .map((r) => r.trim())
    .filter((r) => r && !Object.hasOwn(orgRoles, r));
  const customRoles: Record<string, Permissions> = {};
  if (custom.length) {
    // Read the table directly: auth.api.listOrgRoles demands ac:read, which most custom roles lack.
    // Better Auth stores `permission` as JSON text.
    const rows = await db
      .select({ role: organizationRole.role, permission: organizationRole.permission })
      .from(organizationRole)
      .where(and(eq(organizationRole.organizationId, organizationId), inArray(organizationRole.role, custom)));
    for (const r of rows) customRoles[r.role] = JSON.parse(r.permission) as Permissions;
  }
  return resolveOrgAccess({ ...base, memberRole, customRoles });
});

export const getOrgAccess = cache(async (): Promise<OrgAccess> => {
  const session = await getSession();
  if (!session) throw new AuthError();
  const organizationId = session.session.activeOrganizationId;
  if (!organizationId) {
    return resolveOrgAccess({
      platformRole: session.user.platformRole,
      userId: session.user.id,
      organizationId: null,
      memberRole: null,
      customRoles: {},
      roles: orgRoles,
      ac,
    });
  }
  return getOrgAccessFor(organizationId);
});
