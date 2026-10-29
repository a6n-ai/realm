"use client";

import Link from "next/link";
import { RefreshCwIcon } from "lucide-react";
import { formatMoney as fmt } from "@foundry/commons";
import { TableCell } from "@foundry/ui/table";
import { Badge } from "@/components/reui/badge";
import { DataTable, ListPagination, type Column } from "@/components/ds";
import { humanDate } from "@/lib/deliveries-view";
import type { RenewalsTab } from "@/lib/renewals/filters";
import type { RenewalRow } from "@/lib/services/renewals.service";
import type { RenewalStatus } from "@/lib/services/orders.service";
import { EstimateButton } from "./estimate-button";

const COLUMNS: readonly Column<"customer" | "plan" | "last" | "status" | "money" | "actions">[] = [
  { key: "customer", label: "Customer" },
  { key: "plan", label: "Plan" },
  { key: "last", label: "Last tiffin" },
  { key: "status", label: "Next plan" },
  { key: "money", label: "Wallet · spent", align: "right" },
  { key: "actions", label: "", align: "right" },
];

const STATUS: Record<RenewalStatus, { label: string; variant: "success-light" | "warning-light" | "info-light" | "secondary" }> = {
  renewed: { label: "Renewed", variant: "success-light" },
  unpaid: { label: "Renewed: unpaid", variant: "warning-light" },
  waitlisted: { label: "Renewed: waitlisted", variant: "info-light" },
  none: { label: "Not renewed", variant: "secondary" },
};

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

function whenLabel(lastTiffin: string, today: string) {
  const d = daysBetween(today, lastTiffin);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}

/** Facts staff weigh before calling: each chip states what happened, never a guess. */
function FactChips({ r }: { r: RenewalRow }) {
  const chips = [
    r.priorPlans > 0 && `Renewed ${r.priorPlans}× before`,
    r.holds > 0 && `${r.holds} ${r.holds === 1 ? "day" : "days"} held or paused`,
    r.openTickets > 0 && `${r.openTickets} open ${r.openTickets === 1 ? "ticket" : "tickets"}`,
  ].filter((c): c is string => Boolean(c));
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((c) => <Badge key={c} variant="outline">{c}</Badge>)}
    </div>
  );
}

export function RenewalsList({ rows, total, page, size, tab, today }: { rows: RenewalRow[]; total: number; page: number; size: number; tab: RenewalsTab; today: string }) {
  return (
    <div className="flex flex-col gap-4">
      <DataTable
        serialOffset={page * size}
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.orderPublicId}
        idAccessor={(r) => r.code}
        idHref={(r) => `/dashboard/orders/${r.orderPublicId}`}
        idLabel="Order"
        emptyIcon={RefreshCwIcon}
        emptyMessage={tab === "trials" ? "No trials in this window. Try a wider Ending or Ended range." : "No plans in this window. Try a wider Ending or Ended range."}
        renderRow={(r) => (
          <>
            <TableCell>
              <div className="flex flex-col gap-1">
                <Link href={`/dashboard/orders/${r.orderPublicId}`} className="font-medium hover:underline">{r.customerName}</Link>
                {r.phone && <span className="text-muted-foreground text-xs tabular-nums">{r.phone}</span>}
                <FactChips r={r} />
              </div>
            </TableCell>
            <TableCell>
              <div className="flex flex-col gap-0.5">
                <span>{r.mealSize}</span>
                <span className="text-muted-foreground text-xs">{r.planName}</span>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex flex-col gap-0.5">
                <span className="tabular-nums">{humanDate(r.lastTiffin)}</span>
                <span className="text-muted-foreground text-xs">{whenLabel(r.lastTiffin, today)}</span>
              </div>
            </TableCell>
            <TableCell>
              <Badge variant={STATUS[r.status].variant}>{tab === "trials" && r.status === "renewed" ? "Converted" : tab === "trials" && r.status === "none" ? "Not converted" : STATUS[r.status].label}</Badge>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">{r.walletCoins} coins</span>
                <span className="text-muted-foreground text-xs">
                  {fmt(Number(r.totalSpent))} spent{r.prevOrderTotal != null ? ` · prev ${fmt(Number(r.prevOrderTotal))}` : ""}
                </span>
              </div>
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
