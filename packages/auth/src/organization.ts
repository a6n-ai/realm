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
