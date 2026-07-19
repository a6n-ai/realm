"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { SearchIcon } from "lucide-react";
import type { FacetDef } from "@realm/design-system";

// Brutalist stand-in for @realm/design-system's FacetFilters — same searchParams
// contract (parseFilterState reads these same keys) but rendered with puchkaman's
// native .select / .input classes instead of the shadcn popover/command stack.
function useFacetParams() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (patch: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") sp.delete(k);
      else sp.set(k, v);
    }
    sp.delete("page"); // any filter change resets to page 0
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };
  return { params, set };
}

export function ProductFilters({ spec }: { spec: FacetDef[] }) {
  const { params, set } = useFacetParams();

  const activeKeys = spec.flatMap((f) => (f.kind === "select" || f.kind === "pills" ? [f.field] : []));
  const anyActive = activeKeys.some((k) => params.get(k)) || Boolean(params.get("q"));

  return (
    <div className="flex wrap-gap" style={{ alignItems: "center" }}>
      {spec.map((f) => {
        if (f.kind === "select" || f.kind === "pills") {
          const current = params.get(f.field) ?? "";
          return (
            <select
              key={f.field}
              className="select"
              style={{ width: "auto", minWidth: 150 }}
              value={current}
              onChange={(e) => set({ [f.field]: e.target.value || null })}
              aria-label={f.label}
            >
              <option value="">{f.label}: All</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          );
        }
        if (f.kind === "search") return <SearchBox key="search" onChange={(q) => set({ q: q || null })} />;
        return null; // dateRange / multi not used by products today
      })}
      {anyActive && (
        <button
          type="button"
          className="btn btn--white btn--sm"
          onClick={() => set(Object.fromEntries([...activeKeys, "q"].map((k) => [k, null])))}
        >
          Clear all
        </button>
      )}
    </div>
  );
}

function SearchBox({ onChange }: { onChange: (q: string) => void }) {
  const params = useSearchParams();
  const [value, setValue] = useState(params.get("q") ?? "");

  useEffect(() => {
    const id = setTimeout(() => onChange(value), 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="field" style={{ gap: 0, minWidth: 200 }}>
      <div style={{ position: "relative" }}>
        <SearchIcon
          size={15}
          style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.5 }}
        />
        <input
          className="input"
          style={{ paddingLeft: 34 }}
          placeholder="Search name or slug…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Search products"
        />
      </div>
    </div>
  );
}
