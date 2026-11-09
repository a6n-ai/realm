"use client";

import { useSearchParams } from "next/navigation";
import { parsePagination } from "@foundry/design-system/filters/parse-filter-state";
import { parseSort, type SortState } from "@foundry/design-system/list-sort";

// Each labels tab renders exactly one list, so that list owns the page-wide
// sort/dir/page/size params. Switching tabs drops them (see LabelsTabs).
export function useTableParams<K extends string>(allowed: readonly K[], fallback: SortState<K>) {
  const sp = useSearchParams();
  const sort = parseSort(
    { sort: sp.get("sort") ?? undefined, dir: sp.get("dir") ?? undefined },
    allowed,
    fallback,
  );
  return { sort, pagination: parsePagination(sp) };
}
