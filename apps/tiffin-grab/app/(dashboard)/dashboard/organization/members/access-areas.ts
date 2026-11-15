import type { ResourceLabel } from "@foundry/crm";

export type AreaBadge = { resource: string; label: string };

/** Areas where the person holds at least one action. */
export function heldAreas(permissions: Record<string, string[]>, resources: ResourceLabel[]): AreaBadge[] {
  return resources
    .filter((r) => r.actions.some((a) => permissions[r.resource]?.includes(a.action)))
    .map((r) => ({ resource: r.resource, label: r.label }));
}

/** Every action in every area. The People table shows this as "Full access" instead of one badge per area. */
export function hasFullAccess(permissions: Record<string, string[]>, resources: ResourceLabel[]): boolean {
  return resources.length > 0 && resources.every((r) => r.actions.every((a) => permissions[r.resource]?.includes(a.action)));
}
