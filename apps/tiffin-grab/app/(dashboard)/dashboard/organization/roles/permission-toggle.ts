import type { PermissionMap } from "@foundry/crm";

/** One switch flips one action. An emptied resource is dropped, matching what the server stores. */
export function setPermission(value: PermissionMap, resource: string, action: string, on: boolean): PermissionMap {
  const current = value[resource] ?? [];
  const next = on ? [...new Set([...current, action])] : current.filter((a) => a !== action);
  const { [resource]: _drop, ...rest } = value;
  return next.length ? { ...rest, [resource]: next } : rest;
}
