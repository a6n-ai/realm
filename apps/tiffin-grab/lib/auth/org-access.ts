import { cache } from "react";
import { AuthError } from "@foundry/commons";
import { resolveOrgAccess, type OrgAccess, type Permissions } from "@foundry/auth";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { member, organizationRole } from "@/db/schema";
import { userIdByPublicId } from "@/lib/identity/user-ids";
import { ac, appStatement, orgRoles } from "./permissions";
import { getSession } from "./session";
import { isCustomerRole } from "@/lib/roles";

/** The caller's member role string in one org, or null with no member row there. Per request only. */
export const memberRoleIn = cache(async (organizationId: string, userId: bigint): Promise<string | null> => {
  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)));
  return row?.role ?? null;
});

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
  // users.role stays the staff/customer marker: a customer holding a member row (the old seed wrote
  // one for everyone) must not reach staff actions through it.
  if (isCustomerRole(session.user.role)) return { kind: "none" };
  const dbUserId = await userIdByPublicId(session.user.id);
  if (!dbUserId) return { kind: "none" };
  const memberRole = await memberRoleIn(organizationId, dbUserId);
  if (memberRole == null) return { kind: "none" };
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
  const { roles, statements } = resolveMemberAccess(memberRole, customRoles);
  // Built-in roles keep their orgRoles object: requireOwnerToGrant compares by identity.
  const builtIns = orgRoles as Record<string, ReturnType<typeof ac.newRole>>;
  return {
    kind: "member",
    userId: session.user.id,
    organizationId,
    roles: roles.map((name, i) => (Object.hasOwn(builtIns, name) ? builtIns[name] : ac.newRole(statements[i]))),
  };
});

export type MemberAccess = {
  roles: string[];
  /** Aligned with `roles`: what each resolved role grants. */
  statements: Permissions[];
  /** Union across the roles, the same as effectivePermissions. */
  permissions: Permissions;
  /** resource -> action -> the roles that grant it. */
  grants: Record<string, Record<string, string[]>>;
  /** Names in the comma list that resolve to no built-in or custom role (deleted custom roles). */
  unresolved: string[];
};

/** Pure: a member row's comma list resolved against built-in roles and this org's custom roles. */
export function resolveMemberAccess(memberRole: string, customRoles: Record<string, Permissions>): MemberAccess {
  const roles: string[] = [];
  const statements: Permissions[] = [];
  const unresolved: string[] = [];
  const permissions: Record<string, Set<string>> = {};
  const grants: Record<string, Record<string, string[]>> = {};
  for (const raw of memberRole.split(",")) {
    const name = raw.trim();
    if (!name) continue;
    // Object.hasOwn: a role named "constructor" must not resolve via the prototype.
    const granted = Object.hasOwn(orgRoles, name)
      ? (orgRoles as Record<string, { statements: Permissions }>)[name].statements
      : Object.hasOwn(customRoles, name)
        ? customRoles[name]
        : undefined;
    if (!granted) {
      unresolved.push(name);
      continue;
    }
    roles.push(name);
    statements.push(granted);
    for (const [resource, actions] of Object.entries(granted)) {
      const set = (permissions[resource] ??= new Set());
      const byAction = (grants[resource] ??= {});
      for (const action of actions) {
        set.add(action);
        (byAction[action] ??= []).push(name);
      }
    }
  }
  return {
    roles,
    statements,
    permissions: Object.fromEntries(Object.entries(permissions).map(([k, v]) => [k, [...v]])),
    grants,
    unresolved,
  };
}

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

/** Display name of the caller's role in the active org, for the sidebar user chip. */
export async function getActiveRoleLabel(): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;
  if (session.user.platformRole === "super_admin") return "Super admin";
  const organizationId = session.session.activeOrganizationId;
  const dbUserId = organizationId ? await userIdByPublicId(session.user.id) : null;
  if (!organizationId || !dbUserId) return null;
  const role = await memberRoleIn(organizationId, dbUserId);
  return role != null ? role.split(",").map((r) => r.trim().replaceAll("_", " ")).filter(Boolean).join(", ") : null;
}

/** What the viewer may hand out: their roles combined (platform admins: every app permission). */
export function effectivePermissions(access: OrgAccess): Permissions {
  if (access.kind === "none") return {};
  if (access.kind === "platform") return Object.fromEntries(Object.entries(appStatement).map(([k, v]) => [k, [...v]]));
  const out: Record<string, Set<string>> = {};
  for (const role of access.roles) {
    for (const [resource, actions] of Object.entries(role.statements)) {
      const set = (out[resource] ??= new Set());
      for (const a of actions as string[]) set.add(a);
    }
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v]]));
}

/** What one role name grants in an org: built-in from `orgRoles`, custom from the organization_role table. */
/** null when the org has no role by that name. */
export async function rolePermissions(organizationId: string, role: string): Promise<Permissions | null> {
  const builtIn = (orgRoles as Record<string, { statements: Permissions } | undefined>)[role];
  if (Object.hasOwn(orgRoles, role) && builtIn) return builtIn.statements;
  const [row] = await db
    .select({ permission: organizationRole.permission })
    .from(organizationRole)
    .where(and(eq(organizationRole.organizationId, organizationId), eq(organizationRole.role, role)));
  return row ? (JSON.parse(row.permission) as Permissions) : null;
}
