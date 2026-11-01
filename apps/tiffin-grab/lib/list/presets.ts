/** Owner facet value for records nobody owns yet. */
export const UNASSIGNED_OWNER = "none";

/** A one-click list view: the exact URL params it sets. Built server-side so `me` can be the session user. */
export type FilterPreset = { key: string; label: string; params: Readonly<Record<string, string>> };

/**
 * Keys a preset owns: the list's facet params plus every key any preset sets. Applying a preset clears
 * all of them first, so a chip always lands on exactly its own view instead of stacking on stale picks.
 */
export function managedKeys(presets: readonly FilterPreset[], facetFields: readonly string[]): string[] {
  return [...new Set([...facetFields, ...presets.flatMap((p) => Object.keys(p.params))])];
}

export function applyPreset(current: URLSearchParams, preset: FilterPreset | null, managed: readonly string[]): URLSearchParams {
  const sp = new URLSearchParams(current);
  for (const k of managed) sp.delete(k);
  sp.delete("page");
  for (const [k, v] of Object.entries(preset?.params ?? {})) sp.set(k, v);
  return sp;
}

/** The preset whose managed keys match the URL exactly; search and dates don't count. */
export function activePresetKey(current: URLSearchParams, presets: readonly FilterPreset[], managed: readonly string[]): string | null {
  return presets.find((p) => managed.every((k) => (p.params[k] ?? null) === current.get(k)))?.key ?? null;
}
