"use client";

import { useCallback } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useListNav } from "@/components/ds";
import { SearchInput, type FacetDef } from "@/components/ds";
import { DefaultDateRange } from "./default-date-range";
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
  dateControl = "menu",
  clearValues,
}: {
  spec: FacetDef[];
  placeholder?: string;
  shortPlaceholder?: string;
  /** `menu` keeps the date inside Filter. `inline` shows it beside search. `external` leaves it to the page. */
  dateControl?: "menu" | "inline" | "external";
  /** Select/pills clear sentinels forwarded to ReuiFacetFilters (e.g. Renewals `ending=off`). */
  clearValues?: Readonly<Record<string, string>>;
}) {
  const searchFacet = spec.find((f) => f.kind === "search");
  const nav = useListNav();
  const pathname = usePathname();
  const params = useSearchParams();
  const q = params.get("q") ?? "";
  // Mirrors DataTable's own internal search-query hook: merge q, and drop page
  // so a search typed while on page 2 doesn't land on an empty filtered page.
  const setQ = useCallback(
    (raw: string) => {
      // Server search ignores spacing, so a typed space or doubled gap would
      // only refetch the same rows.
      const v = raw.trim().replace(/\s+/g, " ");
      if (v === q) return;
      const sp = new URLSearchParams(params.toString());
      if (v) sp.set("q", v);
      else sp.delete("q");
      sp.delete("page");
      const qs = sp.toString();
      nav(qs ? `${pathname}?${qs}` : pathname);
    },
    [params, pathname, nav, q],
  );

  const hasDate = spec.some((f) => f.kind === "dateRange");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {dateControl === "inline" && hasDate ? <DefaultDateRange /> : null}
      {searchFacet && (
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder={placeholder}
          shortPlaceholder={shortPlaceholder}
          debounceMs={500}
        />
      )}
      <ReuiFacetFilters spec={spec} hideDate={dateControl !== "menu" && hasDate} clearValues={clearValues} />
    </div>
  );
}
