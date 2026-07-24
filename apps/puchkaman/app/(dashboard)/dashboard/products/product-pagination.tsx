"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { PAGE_SIZES } from "@realm/design-system";

// Brutalist stand-in for @realm/design-system's ListPagination — same
// page/size searchParams contract, puchkaman btn styling instead of shadcn.
export function ProductPagination({ page, size, total }: { page: number; size: number; total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const pageCount = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(Math.max(0, page), pageCount - 1);

  const push = (next: Record<string, string>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) sp.set(k, v);
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  const start = total === 0 ? 0 : safePage * size + 1;
  const end = Math.min(total, (safePage + 1) * size);

  return (
    <div className="flex wrap-gap between" style={{ alignItems: "center", paddingTop: 4 }}>
      <div className="mono" style={{ fontSize: "0.8rem", opacity: 0.7 }}>
        {start}–{end} of {total}
        <select
          className="select"
          style={{ width: "auto", display: "inline-block", marginLeft: 10, padding: "6px 10px" }}
          value={String(size)}
          onChange={(e) => push({ size: e.target.value, page: "0" })}
          aria-label="Rows per page"
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s} / page
            </option>
          ))}
        </select>
      </div>
      <div className="flex" style={{ gap: 8 }}>
        <button
          type="button"
          className="btn btn--white btn--sm"
          disabled={safePage <= 0}
          onClick={() => push({ page: String(safePage - 1) })}
        >
          <ChevronLeftIcon size={15} /> Prev
        </button>
        <span className="mono" style={{ fontSize: "0.8rem", alignSelf: "center", opacity: 0.7 }}>
          Page {safePage + 1} of {pageCount}
        </span>
        <button
          type="button"
          className="btn btn--white btn--sm"
          disabled={safePage >= pageCount - 1}
          onClick={() => push({ page: String(safePage + 1) })}
        >
          Next <ChevronRightIcon size={15} />
        </button>
      </div>
    </div>
  );
}
