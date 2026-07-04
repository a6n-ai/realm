"use client";

import Link from "next/link";
import { ChevronRightIcon, UsersIcon } from "lucide-react";
import { Button } from "@realm/ui/button";
import { Skeleton } from "@realm/ui/skeleton";
import {
  FilterBar, SearchInput, OrderStatusBadge, EmptyState, SortableHeader,
} from "@/components/ds";
import {
  Table, TableHeader, TableHead, TableBody, TableRow, TableCell,
} from "@realm/ui/table";
import { cn } from "@realm/ui/cn";
import type { SortState } from "@/lib/list/sort";
import { useUrlState } from "@/lib/list/use-url-state";
import type { CustomerSortColumn } from "./page";

type Row = {
  publicId: string;
  email: string | null;
  phone: string | null;
  orderCount: number;
  latestStatus: string | null;
};

// Single source of truth for the table's columns. The real header and the
// skeleton twin both render from this — change a column here and both update,
// so the loading skeleton can never drift from the component.
const COLUMNS = [
  { key: "email", label: "Email", sortable: true },
  { key: "phone", label: "Phone", sortable: true },
  { key: "orders", label: "Orders", sortable: true, align: "right" },
  { key: "latestStatus", label: "Latest status" },
  { key: "chevron", label: "", width: "w-8" },
] as const;

export function CustomersList({
  rows,
  sort,
}: {
  rows: Row[];
  sort: SortState<CustomerSortColumn>;
}) {
  const [search, setSearch] = useUrlState("q", "");
  const q = search.toLowerCase();
  const filtered = rows.filter(
    (r) =>
      !q ||
      (r.email ?? "").toLowerCase().includes(q) ||
      (r.phone ?? "").includes(q),
  );

  return (
    <div className="space-y-4">
      <FilterBar
        search={<SearchInput value={search} onChange={setSearch} placeholder="Search customers…" />}
        filters={null}
      />
      {filtered.length === 0 ? (
        q ? (
          <EmptyState
            icon={UsersIcon}
            message="No customers match your search."
            action={
              <Button variant="outline" size="sm" onClick={() => setSearch("")}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState icon={UsersIcon} message="No customers yet." />
        )
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((c) =>
                "sortable" in c && c.sortable ? (
                  <SortableHeader
                    key={c.key}
                    column={c.key as CustomerSortColumn}
                    label={c.label}
                    currentSort={sort.column}
                    currentDir={sort.dir}
                    className={"align" in c ? "text-right" : undefined}
                  />
                ) : (
                  <TableHead key={c.key} className={cn("align" in c && "text-right", "width" in c && c.width)}>
                    {c.label}
                  </TableHead>
                ),
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.publicId} className="group cursor-pointer">
                <TableCell className="font-medium">
                  <Link
                    href={`/dashboard/customers/${c.publicId}`}
                    className="group-hover:underline"
                  >
                    {c.email ?? "(no email)"}
                  </Link>
                </TableCell>
                <TableCell>{c.phone ?? "no phone"}</TableCell>
                <TableCell className="text-right"><span className="nums">{c.orderCount}</span></TableCell>
                <TableCell>
                  {c.latestStatus ? <OrderStatusBadge status={c.latestStatus} /> : "—"}
                </TableCell>
                <TableCell>
                  <ChevronRightIcon className="size-4 opacity-0 transition-opacity group-hover:opacity-60" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// Exact loading twin: same COLUMNS + same FilterBar/Table markup, grey cells
// instead of data. Rendered as the page's <Suspense fallback>, so it always
// matches CustomersList by construction.
export function CustomersListSkeleton() {
  return (
    <div className="space-y-4">
      <FilterBar search={<Skeleton className="h-9 w-full" />} filters={null} />
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((c) => (
              <TableHead key={c.key} className={cn("align" in c && "text-right", "width" in c && c.width)}>
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 8 }).map((_, r) => (
            <TableRow key={r}>
              {COLUMNS.map((c) => (
                <TableCell key={c.key} className={"align" in c ? "text-right" : undefined}>
                  <Skeleton
                    className={cn(
                      "h-4",
                      c.key === "chevron" ? "w-4" : "w-full max-w-32",
                      "align" in c && "ml-auto",
                    )}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
