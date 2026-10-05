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

/** Client-side sort for lists already in memory. Blanks sort last in both directions. */
export function sortRows<Row, K extends string>(
  rows: readonly Row[],
  sort: SortState<K>,
  value: (row: Row, column: K) => string | number | null | undefined,
): Row[] {
  const sign = sort.dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = value(a, sort.column);
    const bv = value(b, sort.column);
    const aBlank = av == null || av === "";
    const bBlank = bv == null || bv === "";
    if (aBlank || bBlank) return aBlank === bBlank ? 0 : aBlank ? 1 : -1;
    const diff =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
    return diff * sign;
  });
}
