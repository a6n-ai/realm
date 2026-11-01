"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useListNav } from "@/components/ds";
import { SearchInput, type FacetDef } from "@/components/ds";
import { DefaultDateRange } from "./default-date-range";
import { ReuiFacetFilters } from "./reui-facet-filters";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { activePresetKey, applyPreset, facetFields, managedKeys, type FilterPreset } from "@/lib/list/presets";
import { filterRecommendationsAction, recordFilterUseAction } from "@/lib/services/filter-usage.actions";

const DEFAULT_PINNED = 3;
// Record a combination only once the user stops changing filters, not every intermediate pick.
const RECORD_AFTER_MS = 2500;

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
  pinned,
}: {
  spec: FacetDef[];
  placeholder?: string;
  shortPlaceholder?: string;
  /** `menu` keeps the date inside Filter. `inline` shows it beside search. `external` leaves it to the page. */
  dateControl?: "menu" | "inline" | "external";
  /** Select/pills clear sentinels forwarded to ReuiFacetFilters (e.g. Renewals `ending=off`). */
  clearValues?: Readonly<Record<string, string>>;
  /** Facet fields shown as chips up front. Defaults to the first three in the spec. */
  pinned?: readonly string[];
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
  const hideDate = dateControl !== "menu" && hasDate;
  const shownPinned = useMemo(
    () =>
      pinned ??
      spec
        .flatMap((f) => (f.kind === "search" || (hideDate && f.kind === "dateRange") ? [] : [f.field]))
        .slice(0, DEFAULT_PINNED),
    [pinned, spec, hideDate],
  );
  const fields = useMemo(() => facetFields(spec), [spec]);

  // Recommendations: the viewer's own most-used filters on this list, else their organization's.
  // Keyed on the path only; the spec is refreshed through a ref so each filter change doesn't refetch.
  const [presets, setPresets] = useState<FilterPreset[]>([]);
  const specRef = useRef(spec);
  useEffect(() => {
    specRef.current = spec;
  }, [spec]);
  useEffect(() => {
    let live = true;
    filterRecommendationsAction(pathname, specRef.current)
      .then((p) => live && setPresets(p))
      .catch(() => live && setPresets([]));
    return () => {
      live = false;
    };
  }, [pathname]);

  // The settled facet combination, recorded once per change.
  const facetQuery = useMemo(() => {
    const sp = new URLSearchParams();
    for (const f of fields) {
      const v = params.get(f);
      if (v) sp.set(f, v);
    }
    return sp.toString();
  }, [fields, params]);
  const recorded = useRef("");
  useEffect(() => {
    if (!facetQuery || facetQuery === recorded.current) return;
    const t = setTimeout(() => {
      recorded.current = facetQuery;
      recordFilterUseAction(pathname, facetQuery, fields).catch(() => {});
    }, RECORD_AFTER_MS);
    return () => clearTimeout(t);
  }, [facetQuery, pathname, fields]);

  const managed = useMemo(() => managedKeys(presets, fields), [presets, fields]);
  const activePreset = activePresetKey(params, presets, managed);
  const pickPreset = (key: string) => {
    const qs = applyPreset(params, presets.find((p) => p.key === key) ?? null, managed).toString();
    nav(qs ? `${pathname}?${qs}` : pathname);
  };

  const bar = (
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
      <ReuiFacetFilters spec={spec} hideDate={hideDate} pinned={shownPinned} clearValues={clearValues} />
    </div>
  );
  if (!presets.length) return bar;

  return (
    <div className="flex flex-col gap-2">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        aria-label="Recommended filters"
        className="flex-wrap"
        value={activePreset ?? ""}
        // Clicking the active chip again resets to the default view.
        onValueChange={pickPreset}
      >
        {presets.map((p) => (
          <ToggleGroupItem key={p.key} value={p.key}>
            {p.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {bar}
    </div>
  );
}
