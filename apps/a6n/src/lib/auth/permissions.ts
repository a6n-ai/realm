import { createAccessControl as createAc } from "better-auth/plugins/access";
import { adminAc, defaultStatements, memberAc, ownerAc } from "better-auth/plugins/organization/access";
import { createAccessControl } from "@foundry/auth";

// Deliberately no better-auth `user`/`session` resources: the admin plugin's endpoints check them, so every one stays forbidden.
export const statement = {
  inquiry: ["read", "create", "update", "note", "claim", "assign"],
  source: ["manage"],
  team: ["manage"],
} as const;

export type Role = "admin" | "sales";
export type Permission = {
  [R in keyof typeof statement]: `${R}:${(typeof statement)[R][number]}`;
}[keyof typeof statement];

const grants: Record<Role, { [R in keyof typeof statement]?: readonly (typeof statement)[R][number][] }> = {
  admin: statement,
  sales: { inquiry: ["read", "create", "update", "note", "claim"] },
};

export const ac = createAccessControl(statement);
export const roles = { admin: ac.newRole(grants.admin), sales: ac.newRole(grants.sales) };

export function allows(role: Role, permission: Permission): boolean {
  const [resource, action] = permission.split(":") as [keyof typeof statement, string];
  return (grants[role]?.[resource] as readonly string[] | undefined)?.includes(action) ?? false;
}

// ---- Organisations (Better Auth organization plugin). Replaces the admin/sales grants above (Task 4 removes those).

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
