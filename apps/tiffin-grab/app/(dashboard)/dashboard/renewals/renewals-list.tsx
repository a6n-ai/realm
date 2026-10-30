"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCwIcon, UsersIcon } from "lucide-react";
import { FactTag } from "./fact-tags";
import { formatMoney as fmt } from "@foundry/commons";
import { TableCell } from "@foundry/ui/table";
import { Badge } from "@/components/reui/badge";
import { DataTable, ListPagination, type Column, type FacetDef } from "@/components/ds";
import { ListSearchFilters } from "@/components/filters/list-search-filters";
import { humanDate } from "@/lib/deliveries-view";
import { rowStatus, statusLabel, type RenewalStatusFilter, type RenewalsTab } from "@/lib/renewals/filters";
import type { RenewalRow, RenewedCustomerRow } from "@/lib/services/renewals.service";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import { EstimateButton } from "./estimate-button";

const COLUMNS: readonly Column<"customer" | "plan" | "last" | "status" | "coins" | "spent" | "total" | "actions">[] = [
  // Widths sum to ~1090px with the # and Order columns, so all nine fit a 1440px screen.
  { key: "customer", label: "Customer", width: "w-40" },
  { key: "plan", label: "Meal size", width: "w-28" },
  { key: "last", label: "Last tiffin", width: "w-36" },
  { key: "status", label: "Status", width: "w-32" },
  { key: "coins", label: "Wallet", align: "right", width: "w-20" },
  { key: "spent", label: "Total spent", align: "right", width: "w-24" },
  { key: "total", label: "Last spent", align: "right", width: "w-24" },
  { key: "actions", label: "Actions", align: "right", width: "w-20" },
];

const STATUS_VARIANT: Record<RenewalStatusFilter, "success-light" | "warning-light" | "info-light" | "secondary" | "destructive-light"> = {
  renewed: "success-light",
  unpaid: "warning-light",
  waitlisted: "info-light",
  not_renewed: "secondary",
  lapsed: "destructive-light",
};

function whenLabel(lastTiffin: string, today: string) {
  const d = Math.round((Date.parse(lastTiffin) - Date.parse(today)) / 86_400_000);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}


/** Rows open the customer's renewal page; an order with no account falls back to the order. */
const renewalHref = (r: { customerPublicId: string | null; orderPublicId: string }) =>
  r.customerPublicId ? `/dashboard/renewals/customers/${r.customerPublicId}` : `/dashboard/orders/${r.orderPublicId}`;

export function RenewalsList({ rows, total, page, size, tab, today, spec }: { rows: RenewalRow[]; total: number; page: number; size: number; tab: RenewalsTab; today: string; spec: FacetDef[] }) {
  return (
    <div className="flex flex-col gap-4">
      <DataTable
        serialOffset={page * size}
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.orderPublicId}
        idAccessor={(r) => r.code}
        // Row click opens the customer's renewal page; each plan there links to its order.
        idHref={renewalHref}
        idLabel="Order"
        rowClassName={() => "group"}
        filters={
          <ListSearchFilters
            spec={spec}
            placeholder="Search name, order or phone…"
            shortPlaceholder="Search…"
          />
        }
        emptyIcon={RefreshCwIcon}
        emptyMessage={tab === "trials" ? "No trials in this date range. Pick a wider range or another date type." : "No plans in this date range. Pick a wider range or another date type."}
        emptySearchMessage="No plans match your search."
        renderRow={(r) => (
          <>
            <TableCell className="font-medium">
              <Link href={renewalHref(r)} className="group-hover:underline">{r.customerName}</Link>
              <FactTag fact="priorPlans" n={r.priorPlans} title={`Renewed ${r.priorPlans}× before`} />
              <FactTag fact="holds" n={r.holds} title={`${r.holds} ${r.holds === 1 ? "day" : "days"} held or paused on this plan`} />
              <FactTag fact="openTickets" n={r.openTickets} title={`${r.openTickets} open ${r.openTickets === 1 ? "ticket" : "tickets"}`} />
            </TableCell>
            <TableCell>{r.mealSize}</TableCell>
            <TableCell className="tabular-nums" title={humanDate(r.lastTiffin)}>
              {humanDate(r.lastTiffin)} <span className="text-muted-foreground">· {whenLabel(r.lastTiffin, today)}</span>
            </TableCell>
            <TableCell>
              <Badge variant={STATUS_VARIANT[rowStatus(r.status, r.lastTiffin, today)]}>{statusLabel(rowStatus(r.status, r.lastTiffin, today), tab)}</Badge>
            </TableCell>
            <TableCell className="text-right tabular-nums">{r.walletCoins} <span className="text-muted-foreground">coins</span></TableCell>
            <TableCell className="text-right tabular-nums">{fmt(Number(r.totalSpent))}</TableCell>
            <TableCell className="text-right tabular-nums" title={r.prevOrderTotal != null ? `Plan before this one: ${fmt(Number(r.prevOrderTotal))}` : "No plan before this one"}>
              {fmt(Number(r.planTotal))}
            </TableCell>
            <TableCell className="text-right">
              <EstimateButton orderPublicId={r.orderPublicId} />
            </TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function RenewalsListSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} hasId />;
}

const CUSTOMER_COLUMNS: readonly Column<"customer" | "renewals" | "lastRenewed" | "current" | "spent">[] = [
  { key: "customer", label: "Customer" },
  { key: "renewals", label: "Renewals", align: "right" },
  { key: "lastRenewed", label: "Last renewed" },
  { key: "current", label: "Current plan" },
  { key: "spent", label: "Spent", align: "right" },
];

/** Every customer who has renewed at least once, newest renewal first. */
export function RenewedCustomersList({ rows, total, page, size, today, spec }: { rows: RenewedCustomerRow[]; total: number; page: number; size: number; today: string; spec: FacetDef[] }) {
  const tz = useTimezone();
  const router = useRouter();
  return (
    <div className="flex flex-col gap-4">
      <DataTable
        serialOffset={page * size}
        columns={CUSTOMER_COLUMNS}
        rows={rows}
        rowKey={(r) => r.customerPublicId}
        onRowClick={(r) => router.push(`/dashboard/renewals/customers/${r.customerPublicId}`)}
        rowClassName={() => "group"}
        filters={<ListSearchFilters spec={spec} placeholder="Search name, phone or email…" shortPlaceholder="Search…" />}
        emptyIcon={UsersIcon}
        emptyMessage="No customer has renewed in this range. Pick a longer Renewed in last range."
        emptySearchMessage="No customers match your search."
        renderRow={(r) => (
          <>
            <TableCell className="font-medium">
              <Link href={`/dashboard/renewals/customers/${r.customerPublicId}`} className="group-hover:underline">{r.customerName || "Unnamed customer"}</Link>
              {r.phone && <span className="text-muted-foreground ml-2 text-xs font-normal tabular-nums">{r.phone}</span>}
            </TableCell>
            <TableCell className="text-right tabular-nums">{r.renewals} <span className="text-muted-foreground">of {r.plans} plans</span></TableCell>
            <TableCell className="tabular-nums">{formatEpoch(r.lastRenewedAt, { mode: "date", timeZone: tz })}</TableCell>
            <TableCell>
              {r.currentMealSize ? (
                <>
                  {r.currentMealSize}
                  {r.currentLastTiffin && <span className="text-muted-foreground"> · ends {whenLabel(r.currentLastTiffin, today)}</span>}
                </>
              ) : (
                <span className="text-muted-foreground">None running</span>
              )}
            </TableCell>
            <TableCell className="text-right tabular-nums">{fmt(Number(r.totalSpent))}</TableCell>
          </>
        )}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function RenewedCustomersListSkeleton() {
  return <DataTable.Skeleton columns={CUSTOMER_COLUMNS} />;
}
