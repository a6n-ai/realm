import type { FacetDef } from "@/components/ds";

/** Owner facet value for records nobody owns yet. */
export const UNASSIGNED_OWNER = "none";
/** Stored in place of the viewer's own owner id, so "my …" pools across staff. */
export const ME = "me";

/** A one-click list view: the exact URL params it sets. */
export type FilterPreset = { key: string; label: string; params: Readonly<Record<string, string>> };

type Params = { get(name: string): string | null };

/** The facet params a list records and recommends: everything but search and the date range. */
export function facetFields(spec: readonly FacetDef[]): string[] {
  return spec.flatMap((f) => (f.kind === "search" || f.kind === "dateRange" ? [] : [f.field]));
}

/**
 * Keys a preset owns: the list's facet params plus every key any preset sets. Applying a preset clears
 * all of them first, so a chip always lands on exactly its own view instead of stacking on stale picks.
 */
export function managedKeys(presets: readonly FilterPreset[], fields: readonly string[]): string[] {
  return [...new Set([...fields, ...presets.flatMap((p) => Object.keys(p.params))])];
}

export function applyPreset(current: URLSearchParams, preset: FilterPreset | null, managed: readonly string[]): URLSearchParams {
  const sp = new URLSearchParams(current);
  for (const k of managed) sp.delete(k);
  sp.delete("page");
  for (const [k, v] of Object.entries(preset?.params ?? {})) sp.set(k, v);
  return sp;
}

/** The preset whose managed keys match the URL exactly; search and dates don't count. */
export function activePresetKey(current: Params, presets: readonly FilterPreset[], managed: readonly string[]): string | null {
  return presets.find((p) => managed.every((k) => (p.params[k] ?? null) === current.get(k)))?.key ?? null;
}

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
