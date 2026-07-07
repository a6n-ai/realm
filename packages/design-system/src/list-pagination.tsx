"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Pagination } from "./pagination";
import { PAGE_SIZES } from "./filters/parse-filter-state";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@realm/ui/select";

export function ListPagination({
  page, size, total, sizes = PAGE_SIZES,
}: {
  page: number;
  size: number;
  total: number;
  sizes?: readonly number[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const pageCount = Math.max(1, Math.ceil(total / size));

  const push = (next: Record<string, string>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) sp.set(k, v);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  const start = total === 0 ? 0 : page * size + 1;
  const end = Math.min(total, (page + 1) * size);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
        <span>
          {start}–{end} of {total}
        </span>
        <Select
          value={String(size)}
          onValueChange={(v) => push({ size: v, page: "0" })}
        >
          <SelectTrigger className="h-8 w-[4.5rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sizes.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>per page</span>
      </div>
      {/* Pagination is 1-indexed; URL page is 0-indexed */}
      <Pagination
        page={page + 1}
        pageCount={pageCount}
        onPage={(p) => push({ page: String(p - 1) })}
      />
    </div>
  );
}
