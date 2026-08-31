// Client hierarchy is capped at 2 levels (brand -> franchise/shop). Enforced here
// rather than recursively in schema, since the cap is a fixed product rule, not a
// query concern — see docs/superpowers/specs/2026-08-18-client-org-hierarchy-design.md.
export type OrgParentRef = { id: string; parentOrganizationId: string | null } | null;

export function assertHierarchyDepth(parent: OrgParentRef): void {
  if (parent && parent.parentOrganizationId !== null) {
    throw new Error(
      `Client hierarchy is capped at 2 levels: "${parent.id}" is already a franchise/shop and cannot have its own children.`,
    );
  }
}

// Cross-org visibility: membership rows are the ONLY source of access — a high role
// within one org never implies visibility into another. The single exception is the
// explicit, audited platformRole bypass (packages/auth/src/audit-events.ts covers the
// audit trail for setting it). Every client-scoped query must filter through this.
export function resolveVisibleOrgIds(input: { platformRole: string | null; memberOrgIds: string[] }): "all" | string[] {
  if (input.platformRole === "super_admin") return "all";
  return input.memberOrgIds;
}
