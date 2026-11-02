/** Sub-category values whose parent is the selected category; none when no category is selected. */
export function pruneSubcategories(
  subs: string[],
  category: string | undefined,
  options: { value: string; parent?: string }[],
): string[] {
  if (!category) return [];
  const parents = new Map(options.map((o) => [o.value, o.parent]));
  return subs.filter((s) => parents.get(s) === category);
}
