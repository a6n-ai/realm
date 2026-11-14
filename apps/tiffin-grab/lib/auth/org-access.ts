import { cache } from "react";
import { headers } from "next/headers";
import { AuthError } from "@foundry/commons";
import { resolveOrgAccess, type OrgAccess, type Permissions } from "@foundry/auth";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { organizationRole } from "@/db/schema";
import { auth } from "./index";
import { ac, orgRoles } from "./permissions";
import { getSession } from "./session";

export const getOrgAccess = cache(async (): Promise<OrgAccess> => {
  const session = await getSession();
  if (!session) throw new AuthError();
  const base = {
    platformRole: session.user.platformRole,
    userId: session.user.id,
    organizationId: session.session.activeOrganizationId,
    roles: orgRoles,
    ac,
  };
  if (session.user.platformRole === "super_admin" || !base.organizationId) {
    return resolveOrgAccess({ ...base, memberRole: null, customRoles: {} });
  }
  const h = { headers: await headers() };
  let memberRole: string | null;
  try {
    memberRole = (await auth.api.getActiveMemberRole(h)).role;
  } catch {
    return { kind: "none" }; // not a member of the active org
  }
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
      .where(and(eq(organizationRole.organizationId, base.organizationId), inArray(organizationRole.role, custom)));
    for (const r of rows) customRoles[r.role] = JSON.parse(r.permission) as Permissions;
  }
  return resolveOrgAccess({ ...base, memberRole, customRoles });
});
