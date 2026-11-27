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
