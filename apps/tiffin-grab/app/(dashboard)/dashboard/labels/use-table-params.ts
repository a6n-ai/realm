"use client";

import { useSearchParams } from "next/navigation";
import { DEFAULT_SIZE, PAGE_SIZES } from "@/components/ds";
import { parseSort, type SortState } from "@/lib/list/sort";

// Each labels tab renders exactly one list, so that list owns the page-wide
// sort/dir/page/size params. Switching tabs drops them (see LabelsTabs).
export function useTableParams<K extends string>(allowed: readonly K[], fallback: SortState<K>) {
  const sp = useSearchParams();
  const sort = parseSort(
    { sort: sp.get("sort") ?? undefined, dir: sp.get("dir") ?? undefined },
    allowed,
    fallback,
  );
  const page = Math.max(0, Number.parseInt(sp.get("page") ?? "0", 10) || 0);
  const rawSize = Number.parseInt(sp.get("size") ?? String(DEFAULT_SIZE), 10);
  const size = (PAGE_SIZES as readonly number[]).includes(rawSize) ? rawSize : DEFAULT_SIZE;
  return { sort, pagination: { page, size } };
}
