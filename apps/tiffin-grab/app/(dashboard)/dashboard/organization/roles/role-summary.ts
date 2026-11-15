import type { PermissionMap, ResourceLabel } from "@foundry/crm";

export type RoleItem = { name: string; id: string | null; permission: PermissionMap; members: number };

// Same rule as isGrantable in @foundry/crm, which the package does not export.
export const isGrantableAction = (grantable: PermissionMap, resource: string, action: string) =>
  grantable[resource]?.includes(action) ?? false;

export const countPermissions = (value: PermissionMap) =>
  Object.values(value).reduce((n, actions) => n + (actions?.length ?? 0), 0);

export const totalPermissions = (resources: ResourceLabel[]) =>
  resources.reduce((n, r) => n + r.actions.length, 0);

export const areasOf = (value: PermissionMap, resources: ResourceLabel[]) =>
  resources.filter((r) => (value[r.resource]?.length ?? 0) > 0);

export const countOn = (value: PermissionMap, resource: ResourceLabel) =>
  resource.actions.filter((a) => value[resource.resource]?.includes(a.action)).length;

/** Order-insensitive: the server may return keys or actions in another order than the draft. */
export function samePermissions(a: PermissionMap, b: PermissionMap): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].every((k) => [...(a[k] ?? [])].sort().join() === [...(b[k] ?? [])].sort().join());
}

export const memberCount = (n: number) => `${n} ${n === 1 ? "member" : "members"}`;
