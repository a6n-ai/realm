export type SortDir = "asc" | "desc";
export type SortState<K extends string = string> = { column: K; dir: SortDir };

export function parseSort<K extends string>(
  sp: { sort?: string; dir?: string },
  allowed: readonly K[],
  fallback: SortState<K>,
): SortState<K> {
  const column = sp.sort && (allowed as readonly string[]).includes(sp.sort) ? (sp.sort as K) : null;
  if (!column) return fallback;
  const dir: SortDir = sp.dir === "desc" ? "desc" : "asc";
  return { column, dir };
}
