// Which sidebar row lights up. Plain module, not part of app-sidebar.tsx: that
// file is "use client", so every export it carries reaches the RSC graph as a
// client reference — and this needs to stay directly unit-testable.

/**
 * Returns the single nav href that should render as active, or null.
 *
 * A href carrying a query ("/dashboard/orders?status=ongoing") is a *saved view*
 * of another row's page. It wins over its plain parent, and it matches on a
 * param subset rather than an exact URL compare so it stays lit while you page,
 * sort, or search inside the view. Switching the status pill to something else
 * drops the subset match and hands the highlight back to the parent.
 */
export function activeNavHref(
  hrefs: readonly string[],
  pathname: string,
  search: URLSearchParams,
): string | null {
  for (const href of hrefs) {
    const [path, qs] = href.split("?");
    if (!qs || pathname !== path) continue;
    if ([...new URLSearchParams(qs)].every(([k, v]) => search.get(k) === v)) return href;
  }

  // Longest prefix, so a nested route prefers the deepest row that owns it.
  let best: string | null = null;
  for (const href of hrefs) {
    if (href.includes("?")) continue;
    const hit = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
    if (hit && (best === null || href.length > best.length)) best = href;
  }
  return best;
}
