// No imports: shared by server and client code. Icons are names, resolved to components in components/ds.

export type GroupIconName = "Truck" | "UtensilsCrossed" | "Users" | "ChartColumn" | "ShieldCheck";
export type GroupColor = "blue" | "amber" | "violet" | "emerald" | "slate";

export type PermissionGroup = {
  key: "operations" | "menu" | "customers" | "finance" | "team";
  label: string;
  icon: GroupIconName;
  color: GroupColor;
  resources: readonly string[];
};

export const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  { key: "operations", label: "Operations", icon: "Truck", color: "blue", resources: ["order", "subscription", "delivery", "holiday", "files"] },
  { key: "menu", label: "Menu & catalog", icon: "UtensilsCrossed", color: "amber", resources: ["menu", "catalog", "discount"] },
  { key: "customers", label: "Customers & support", icon: "Users", color: "violet", resources: ["customer", "inquiry", "ticket", "notification", "wallet"] },
  { key: "finance", label: "Finance & insights", icon: "ChartColumn", color: "emerald", resources: ["finance", "analytics", "audit"] },
  { key: "team", label: "Team & settings", icon: "ShieldCheck", color: "slate", resources: ["staff", "settings", "organization", "member", "invitation", "team", "ac"] },
];

const TEAM = PERMISSION_GROUPS[PERMISSION_GROUPS.length - 1];
const byResource = new Map(PERMISSION_GROUPS.flatMap((g) => g.resources.map((r) => [r, g] as const)));

/** Unknown resources land in Team & settings, the catch-all group. */
export function groupOfResource(resource: string): PermissionGroup {
  return byResource.get(resource) ?? TEAM;
}

/** Splits resource-keyed items into their groups, in group order; empty groups are dropped. */
export function groupResources<T extends { resource: string }>(items: readonly T[]): { group: PermissionGroup; items: T[] }[] {
  return PERMISSION_GROUPS.flatMap((group) => {
    const own = items.filter((i) => groupOfResource(i.resource) === group);
    return own.length > 0 ? [{ group, items: own }] : [];
  });
}
