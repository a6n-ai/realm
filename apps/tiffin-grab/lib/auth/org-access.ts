import { cache } from "react";
import { headers } from "next/headers";
import { AuthError } from "@foundry/commons";
import { resolveOrgAccess, type OrgAccess, type Permissions } from "@foundry/auth";
import { auth } from "./index";
import { ac, orgRoles } from "./permissions";
import { getSession } from "./session";

type OrgRoleRow = { role: string; permission: Permissions };

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
  const needsCustom = memberRole.split(",").some((r) => r.trim() && !Object.hasOwn(orgRoles, r.trim()));
  const customRoles: Record<string, Permissions> = {};
  if (needsCustom) {
    // listOrgRoles itself demands ac:read; a role without it resolves to no custom roles (deny).
    // The foundry plugin wrapper's return type drops the dynamicAccessControl endpoints.
    const api = auth.api as unknown as { listOrgRoles(c: typeof h): Promise<OrgRoleRow[]> };
    const list = await api.listOrgRoles(h).catch((): OrgRoleRow[] => []);
    for (const r of list) customRoles[r.role] = r.permission;
  }
  return resolveOrgAccess({ ...base, memberRole, customRoles });
});
