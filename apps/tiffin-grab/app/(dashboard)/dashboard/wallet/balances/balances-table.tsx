"use client";

import Link from "next/link";
import { WalletIcon } from "lucide-react";
import { DataTable, ListPagination, type Column, type FacetDef, type SortState } from "@/components/ds";
import { ListSearchFilters } from "@/components/filters/list-search-filters";
import { TableCell } from "@foundry/ui/table";

export type BalanceColumn = "customer" | "contact" | "balance" | "value" | "earned" | "redeemed" | "last";

/** One customer wallet, already formatted by the page (functions cannot cross into a client component). */
export type BalanceRow = {
  publicId: string;
  name: string;
  contact: string;
  balance: number;
  value: string;
  earned: number;
  redeemed: number;
  last: string;
};

const COLUMNS: readonly Column<BalanceColumn>[] = [
  { key: "customer", label: "Customer", sortable: true },
  { key: "contact", label: "Contact" },
  { key: "balance", label: "Balance", sortable: true, align: "right" },
  { key: "value", label: "Value", sortable: true, align: "right" },
  { key: "earned", label: "Earned in range", sortable: true, align: "right" },
  { key: "redeemed", label: "Redeemed in range", sortable: true, align: "right" },
  { key: "last", label: "Last activity", sortable: true },
];

export function BalancesTable({ rows, spec, sort, total, page, size }: {
  rows: BalanceRow[];
  spec: FacetDef[];
  sort: SortState<BalanceColumn>;
  total: number;
  page: number;
  size: number;
}) {
  return (
    <>
      <DataTable
        serialOffset={page * size}
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.publicId}
        sort={sort}
        filters={<ListSearchFilters spec={spec} dateControl="external" placeholder="Search by name, email or phone…" shortPlaceholder="Search…" />}
        emptyIcon={WalletIcon}
        emptyMessage="No customer wallets yet. Coins appear here once a customer earns or is given some."
        emptySearchMessage="No wallets match your search or filters."
        renderRow={(r) => (
          <>
            <TableCell>
              <Link href={`/dashboard/customers/${r.publicId}`} className="hover:underline">{r.name}</Link>
            </TableCell>
            <TableCell className="text-muted-foreground">{r.contact}</TableCell>
            <TableCell className="text-right tabular-nums">{r.balance.toLocaleString()}</TableCell>
            <TableCell className="text-right tabular-nums">{r.value}</TableCell>
            <TableCell className="text-right tabular-nums">{r.earned.toLocaleString()}</TableCell>
            <TableCell className="text-right tabular-nums">{r.redeemed.toLocaleString()}</TableCell>
            <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{r.last}</TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </>
  );
}

export function BalancesTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} />;
}
