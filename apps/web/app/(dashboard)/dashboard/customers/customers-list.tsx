"use client";

import { useState } from "react";
import Link from "next/link";
import { UsersIcon } from "lucide-react";
import {
  FilterBar, SearchInput, OrderStatusBadge, EmptyState, SortableHeader,
} from "@/components/ds";
import {
  Table, TableHeader, TableHead, TableBody, TableRow, TableCell,
} from "@/components/ui/table";
import type { SortState } from "@/lib/list/sort";
import type { CustomerSortColumn } from "./page";

type Row = {
  publicId: string;
  email: string | null;
  phone: string | null;
  orderCount: number;
  latestStatus: string | null;
};

export function CustomersList({
  rows,
  sort,
}: {
  rows: Row[];
  sort: SortState<CustomerSortColumn>;
}) {
  const [search, setSearch] = useState("");
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
        <EmptyState icon={UsersIcon} message="No customers match your search." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader column="email" label="Email" currentSort={sort.column} currentDir={sort.dir} />
              <SortableHeader column="phone" label="Phone" currentSort={sort.column} currentDir={sort.dir} />
              <SortableHeader column="orders" label="Orders" currentSort={sort.column} currentDir={sort.dir} />
              <TableHead>Latest status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.publicId}>
                <TableCell className="font-medium">
                  <Link
                    href={`/dashboard/customers/${c.publicId}`}
                    className="hover:underline"
                  >
                    {c.email ?? "(no email)"}
                  </Link>
                </TableCell>
                <TableCell>{c.phone ?? "no phone"}</TableCell>
                <TableCell>{c.orderCount}</TableCell>
                <TableCell>
                  {c.latestStatus ? <OrderStatusBadge status={c.latestStatus} /> : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
