import { createAccessControl as createAc } from "better-auth/plugins/access";
import { adminAc, defaultStatements, memberAc, ownerAc } from "better-auth/plugins/organization/access";
// ---- Organisations (Better Auth organization plugin).

export const appStatement = {
  inquiry: ["read", "create", "update", "note", "claim", "assign"],
  source: ["read", "manage"],
} as const;

export const orgStatement = { ...defaultStatements, ...appStatement } as const;
export const orgAc = createAc(orgStatement);

export const orgRoles = {
  owner: orgAc.newRole({ ...ownerAc.statements, ...appStatement }),
  admin: orgAc.newRole({ ...adminAc.statements, ...appStatement }),
  member: orgAc.newRole({
    ...memberAc.statements,
    inquiry: ["read", "create", "update", "note", "claim"],
    source: ["read"],
  }),
};

export type OrgRole = keyof typeof orgRoles;
export type OrgPermission = {
  [R in keyof typeof orgStatement]: `${R}:${(typeof orgStatement)[R][number]}`;
}[keyof typeof orgStatement];

/** Built-in role check, for pure code paths (tests, nav fallbacks). Custom roles go through the plugin's hasPermission. */
export function staticAllows(role: OrgRole, permission: OrgPermission): boolean {
  const [resource, action] = permission.split(":") as [string, string];
  return orgRoles[role]?.authorize({ [resource]: [action] } as never).success ?? false;
}

// ---- Platform (Better Auth admin plugin). super_admin is granted only by backend SQL; every admin-plugin route that
// could change a role stays disabled.
export const platformAc = createAc({ platform: ["manage"] } as const);
export const platformRoles = {
  super_admin: platformAc.newRole({ platform: ["manage"] }),
  user: platformAc.newRole({}),
};

/** Every grantable permission, as "resource:action". */
export const ALL_PERMISSIONS = Object.entries(orgStatement).flatMap(([r, actions]) =>
  (actions as readonly string[]).map((a) => `${r}:${a}` as OrgPermission),
);
export const isPermission = (p: string): p is OrgPermission => (ALL_PERMISSIONS as string[]).includes(p);

export type Permission = OrgPermission;
export type Statements = Partial<Record<string, readonly string[]>>;

export const isBuiltInRole = (role: string): role is OrgRole => Object.hasOwn(orgRoles, role);

/** Flattens a role's statements to "resource:action" strings, dropping anything outside the catalogue. */
export function permissionsOf(statements: Statements): OrgPermission[] {
  return Object.entries(statements)
    .flatMap(([r, actions]) => (actions ?? []).map((a) => `${r}:${a}`))
    .filter(isPermission);
}

/** Built-in roles' permissions. A member row may hold several roles, comma-separated (Better Auth). */
export function builtInPermissions(role: OrgRole): OrgPermission[] {
  return permissionsOf(orgRoles[role].statements as Statements);
}

/** People who can see the Members page. */
export const canManageMembers = (p: readonly OrgPermission[]) =>
  p.includes("invitation:create") || p.includes("member:update") || p.includes("member:delete");
