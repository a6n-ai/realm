"use client";

import { useState } from "react";
import Link from "next/link";
import { CoinsIcon, WalletIcon } from "lucide-react";
import { DataTable, ListPagination, type Column, type FacetDef, type SortState } from "@/components/ds";
import { ListSearchFilters } from "@/components/filters/list-search-filters";
import { TableCell } from "@foundry/ui/table";
import { RowActionTooltipButton } from "@/components/ds/row-action-tooltip-button";
import { GiveOneCustomerDialog } from "../give/give-one-customer-dialog";

export type BalanceColumn = "customer" | "contact" | "balance" | "value" | "earned" | "redeemed" | "last" | "actions";

/** One customer wallet, already formatted by the page (functions cannot cross into a client component). */
export type BalanceRow = {
  publicId: string;
  name: string;
  email: string;
  phone: string | null;
  balance: number;
  value: string;
  earned: number;
  redeemed: number;
  last: string;
};

const COLUMNS: readonly Column<BalanceColumn>[] = [
  { key: "customer", label: "Customer", sortable: true },
  { key: "contact", label: "Contact" },
  { key: "balance", label: "Balance", sortable: true, align: "right", width: "w-24" },
  { key: "value", label: "Value", sortable: true, align: "right" },
  { key: "earned", label: "Earned", sortable: true, align: "right", width: "w-24" },
  { key: "redeemed", label: "Redeemed", sortable: true, align: "right", width: "w-24" },
  { key: "last", label: "Last activity", sortable: true, width: "w-32" },
  { key: "actions", label: "", align: "right", width: "w-16" },
];

export function BalancesTable({ rows, spec, sort, total, page, size }: {
  rows: BalanceRow[];
  spec: FacetDef[];
  sort: SortState<BalanceColumn>;
  total: number;
  page: number;
  size: number;
}) {
  const [giving, setGiving] = useState<BalanceRow | null>(null);
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
              <Link href={`/dashboard/customers/${r.publicId}/wallet`} className="hover:underline">{r.name}</Link>
            </TableCell>
            <TableCell>
              <div className="flex flex-col">
                <span className="truncate text-muted-foreground">{r.email ?? "—"}</span>
                {r.phone && <span className="truncate text-xs text-muted-foreground">{r.phone}</span>}
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">{r.balance.toLocaleString()}</TableCell>
            <TableCell className="text-right tabular-nums">{r.value}</TableCell>
            <TableCell className="text-right tabular-nums">{r.earned.toLocaleString()}</TableCell>
            <TableCell className="text-right tabular-nums">{r.redeemed.toLocaleString()}</TableCell>
            <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{r.last}</TableCell>
            <TableCell className="text-right">
              <RowActionTooltipButton icon={CoinsIcon} label={`Give coins to ${r.name}`} hint="Give coins" onClick={() => setGiving(r)} />
            </TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
      {giving && (
        <GiveOneCustomerDialog
          key={giving.publicId}
          customer={{ publicId: giving.publicId, fullName: giving.name, email: giving.email, phone: giving.phone }}
          open
          onOpenChange={(o) => !o && setGiving(null)}
        />
      )}
    </>
  );
}

export function BalancesTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} />;
}
