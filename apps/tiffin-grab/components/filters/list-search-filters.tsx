"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchInput, type FacetDef } from "@/components/ds";
import { ReuiFacetFilters } from "./reui-facet-filters";

// Single reusable slot for a server-paginated list page: the search box and
// the facet pills together, so a page can't declare a `{ kind: "search" }`
// facet (which parseFilterState already reads from ?q=) and forget to render
// the box for it — that gap is exactly what left Orders/Inquiries/Customers
// with working search wiring but no visible input. Drop this in DataTable's
// `filters` prop in place of a bare <ReuiFacetFilters>.
export function ListSearchFilters({
  spec,
  placeholder = "Search…",
  shortPlaceholder,
}: {
  spec: FacetDef[];
  placeholder?: string;
  shortPlaceholder?: string;
}) {
  const searchFacet = spec.find((f) => f.kind === "search");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  // Mirrors DataTable's own internal search-query hook: merge q, and drop page
  // so a search typed while on page 2 doesn't land on an empty filtered page.
  const setQ = useCallback(
    (v: string) => {
      const sp = new URLSearchParams(params.toString());
      if (v) sp.set("q", v);
      else sp.delete("q");
      sp.delete("page");
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {searchFacet && (
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder={placeholder}
          shortPlaceholder={shortPlaceholder}
          debounceMs={300}
        />
      )}
      <ReuiFacetFilters spec={spec} />
    </div>
  );
}
