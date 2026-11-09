import type { FacetDef, FilterPreset } from "@foundry/design-system";

/** Owner facet value for records nobody owns yet. */
export const UNASSIGNED_OWNER = "none";
/** Stored in place of the viewer's own owner id, so "my …" pools across staff. */
export const ME = "me";
/** Owner facet value that turns the owner filter off, so a list that defaults to "me" can show everyone. */
export const ALL_OWNERS = "all";

/** URL owner value to the value the query filters on: "me" is the viewer, "all" is no owner filter. */
export function resolveOwnerParam(owner: string | undefined, viewer: string | undefined): string | undefined {
  if (owner === ME) return viewer;
  if (owner === ALL_OWNERS) return undefined;
  return owner;
}

export type { FilterPreset };

type Params = { get(name: string): string | null };

/** One stable string per filter combination: sorted keys, sorted csv values, own owner id as "me". "" = no filter. */
export function canonicalParams(current: Params, fields: readonly string[], me: string): string {
  const out = new URLSearchParams();
  for (const field of [...fields].sort()) {
    const raw = current.get(field);
    if (!raw) continue;
    const vals = raw.split(",").filter(Boolean).map((v) => (field === "owner" && v === me ? ME : v)).sort();
    if (vals.length) out.set(field, vals.join(","));
  }
  return out.toString();
}

/**
 * Turns a stored combination back into a chip for this viewer, labelled from the list's own facets.
 * Null when any field or value is no longer on the list (renamed option, removed facet, junk), so
 * stale or foreign rows never surface.
 */
export function presetFromCanonical(canonical: string, spec: readonly FacetDef[], me: string): FilterPreset | null {
  const stored = new URLSearchParams(canonical);
  const params: Record<string, string> = {};
  const parts: string[] = [];
  for (const facet of spec) {
    if (facet.kind === "search" || facet.kind === "dateRange") continue;
    const raw = stored.get(facet.field);
    if (!raw) continue;
    const labels: string[] = [];
    const values: string[] = [];
    for (const v of raw.split(",")) {
      if (facet.field === "owner" && v === ME) {
        labels.push("Me");
        values.push(me);
        continue;
      }
      const opt = facet.options.find((o) => String(o.value) === v);
      if (!opt) return null;
      labels.push(opt.label);
      values.push(v);
    }
    params[facet.field] = values.join(",");
    parts.push(`${facet.label}: ${labels.join(", ")}`);
  }
  // Every stored key must still be a facet on this list.
  if (!parts.length || [...stored.keys()].some((k) => !(k in params))) return null;
  return { key: canonical, label: parts.join(" · "), params };
}
