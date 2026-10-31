import type { FacetDef } from "@/components/ds";

/**
 * Franchise facet for the analytics filter bar. Only shown when the viewer can pick between two or more
 * franchises; the options are already limited to the session's visible set. No selection means every
 * franchise the viewer can see (unscoped for admins, the visible set for everyone else).
 */
export function franchiseFacets(orgs: { value: string; label: string }[]): FacetDef[] {
  return orgs.length >= 2 ? [{ kind: "multi", field: "org", label: "Franchise", options: orgs }] : [];
}
