"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SearchInput } from "@realm/design-system";
import { searchCatalog, type CatalogSearchResults } from "@/app/(customer)/me/search-actions";

const EMPTY: CatalogSearchResults = { plans: [], meals: [] };

export function CustomerSearch() {
  const [q, setQ] = useState("");
  // Keyed by the query so the empty state is derived, not set synchronously.
  const [found, setFound] = useState<{ q: string; results: CatalogSearchResults }>({ q: "", results: EMPTY });
  const term = q.trim();
  const results = found.q === term ? found.results : EMPTY;

  useEffect(() => {
    if (!term) return;
    let active = true;
    searchCatalog(term)
      .then((r) => { if (active) setFound({ q: term, results: r }); })
      .catch(() => { if (active) setFound({ q: term, results: EMPTY }); });
    return () => { active = false; };
  }, [term]);

  const hasResults = results.plans.length > 0 || results.meals.length > 0;

  return (
    <div className="relative w-full max-w-md">
      <SearchInput value={q} onChange={setQ} placeholder="Search plans & meals…" shortPlaceholder="Search…" debounceMs={200} />
      {q.trim() && hasResults && (
        <div className="bg-popover absolute z-50 mt-1 w-full overflow-hidden rounded-lg border shadow-md">
          <ul className="max-h-80 overflow-y-auto py-1 text-sm">
            {results.plans.map((p) => (
              <li key={`p-${p.key}`}>
                <Link href="/subscribe" className="hover:bg-accent flex items-center gap-2 px-3 py-2" onClick={() => setQ("")}>
                  <span className="text-muted-foreground text-xs">Plan</span> {p.name}
                </Link>
              </li>
            ))}
            {results.meals.map((m, i) => (
              <li key={`m-${i}`}>
                <Link href="/subscribe" className="hover:bg-accent flex items-center gap-2 px-3 py-2" onClick={() => setQ("")}>
                  <span className="text-muted-foreground text-xs">Meal</span> {m.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
