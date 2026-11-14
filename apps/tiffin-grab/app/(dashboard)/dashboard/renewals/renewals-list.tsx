"use client";

import { useEffect, useState, type ReactNode } from "react";
import { daysBetween } from "@foundry/commons/util/dates";
import { pageOffset } from "@foundry/design-system/filters/parse-filter-state";
import { zonedDateIso } from "@foundry/commons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCwIcon, UsersIcon } from "lucide-react";
import { FactTag } from "./fact-tags";
import { formatMoney as fmt } from "@foundry/commons";
import { TableCell } from "@foundry/ui/table";
import { Badge } from "@/components/reui/badge";
import { DataTable, ListPagination, type Column, type FacetDef } from "@/components/ds";
import { ListSearchFilters } from "@/components/filters/reui-facet-filters";
import { humanDate } from "@/lib/deliveries/view";
import { rowStatus, statusLabel, type RenewalRowStatus } from "@/lib/renewals/filters";
import { LOST_REASON_LABELS } from "@/lib/inquiries/lost-reason";
import type { RenewalRow, RenewedCustomerRow } from "@/lib/renewals/renewals.service";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@foundry/design-system/timezone-provider";
import { EstimateButton } from "./estimate-button";
import { TrackStatusPill } from "./_track/track-status";
import { RenewalsColumnsPicker } from "./renewals-columns-picker";
import {
  DEFAULT_PLAN_TABLE_COLUMNS,
  FACT_COLUMN,
  loadPlanTableColumns,
  planTableColumnDefs,
  savePlanTableColumns,
  type PlanTableColumnKey,
} from "./renewal-table-columns";

const STATUS_VARIANT: Record<RenewalRowStatus, "success-light" | "warning-light" | "info-light" | "secondary" | "destructive-light"> = {
  renewed: "success-light",
  unpaid: "warning-light",
  waitlisted: "info-light",
  not_renewed: "secondary",
  lapsed: "destructive-light",
};

const ACTIVITY_LABEL: Record<string, string> = {
  note: "Note",
  call: "Call",
  whatsapp: "WhatsApp",
  email: "Email",
  callback: "Callback",
  reminder_sent: "Reminder sent",
  status_change: "Status changed",
};

function whenLabel(lastTiffin: string, today: string) {
  const d = daysBetween(today, lastTiffin);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}

/** Rows open the customer's renewal page; an order with no account falls back to the order. */
const renewalHref = (r: { customerPublicId: string | null; orderPublicId: string }) =>
  r.customerPublicId ? `/dashboard/renewals/customers/${r.customerPublicId}` : `/dashboard/orders/${r.orderPublicId}`;

function planCell(key: PlanTableColumnKey, r: RenewalRow, today: string, trial: boolean, tz: string, visible: ReadonlySet<PlanTableColumnKey>): ReactNode {
  switch (key) {
    case "customer":
      return (
        <TableCell key={key} className="font-medium">
          <Link href={renewalHref(r)} className="group-hover:underline">{r.customerName}</Link>
          {!visible.has(FACT_COLUMN.priorPlans) && (
            <FactTag fact="priorPlans" n={r.priorPlans} title={`Renewed ${r.priorPlans}× before`} />
          )}
          {!visible.has(FACT_COLUMN.holds) && (
            <FactTag fact="holds" n={r.holds} title={`${r.holds} ${r.holds === 1 ? "day" : "days"} held or paused on this plan`} />
          )}
          {!visible.has(FACT_COLUMN.openTickets) && (
            <FactTag fact="openTickets" n={r.openTickets} title={`${r.openTickets} open ${r.openTickets === 1 ? "ticket" : "tickets"}`} />
          )}
        </TableCell>
      );
    case "phone":
      return (
        <TableCell key={key} className="tabular-nums">
          {r.phone ?? <span className="text-muted-foreground">—</span>}
        </TableCell>
      );
    case "mealSize":
      return <TableCell key={key}>{r.mealSize}</TableCell>;
    case "planName":
      return <TableCell key={key}>{r.planName}</TableCell>;
    case "type":
      return (
        <TableCell key={key}>
          <Badge variant="secondary">{r.trial ? "Trial" : "Regular"}</Badge>
        </TableCell>
      );
    case "last":
      return (
        <TableCell key={key} className="tabular-nums" title={humanDate(r.lastTiffin)}>
          {humanDate(r.lastTiffin)} <span className="text-muted-foreground">· {whenLabel(r.lastTiffin, today)}</span>
        </TableCell>
      );
    case "outcome":
      return (
        <TableCell key={key}>
          <Badge variant={STATUS_VARIANT[rowStatus(r.status, r.lastTiffin, today)]}>{statusLabel(rowStatus(r.status, r.lastTiffin, today), trial)}</Badge>
        </TableCell>
      );
    case "track":
      return (
        <TableCell key={key} className="whitespace-nowrap">
          <TrackStatusPill status={r.track} source={r.trackSource} />
        </TableCell>
      );
    case "lostReason":
      return (
        <TableCell key={key}>
          {r.lostReason ? LOST_REASON_LABELS[r.lostReason] : <span className="text-muted-foreground">—</span>}
        </TableCell>
      );
    case "laterBookedAt": {
      if (r.laterBookedAt == null) {
        return (
          <TableCell key={key}>
            <span className="text-muted-foreground">—</span>
          </TableCell>
        );
      }
      return (
        <TableCell key={key} className="tabular-nums">
          {formatEpoch(r.laterBookedAt, { mode: "date", timeZone: tz })}
        </TableCell>
      );
    }
    case "nextFollowUp": {
      const followIso = r.nextFollowUpAt != null ? zonedDateIso(r.nextFollowUpAt, tz) : null;
      const overdue = followIso != null && followIso < today;
      return (
        <TableCell key={key} className="whitespace-nowrap tabular-nums">
          {followIso ? (
            <span className={overdue ? "text-destructive" : undefined}>
              {humanDate(followIso)}
              {overdue && <span className="text-xs"> · overdue</span>}
            </span>
          ) : (
            <span className="text-muted-foreground">None</span>
          )}
        </TableCell>
      );
    }
    case "lastActivity":
      return (
        <TableCell key={key}>
          {r.lastActivity ? (
            <span className="text-muted-foreground block truncate text-xs" title={r.lastActivity.note ?? ACTIVITY_LABEL[r.lastActivity.type] ?? r.lastActivity.type}>
              {r.lastActivity.note ?? ACTIVITY_LABEL[r.lastActivity.type] ?? r.lastActivity.type}
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          )}
        </TableCell>
      );
    case "priorPlans":
      return (
        <TableCell key={key} className="text-right tabular-nums">
          {r.priorPlans}
        </TableCell>
      );
    case "holds":
      return (
        <TableCell key={key} className="text-right tabular-nums">
          {r.holds}
        </TableCell>
      );
    case "openTickets":
      return (
        <TableCell key={key} className="text-right tabular-nums">
          {r.openTickets}
        </TableCell>
      );
    case "coins":
      return (
        <TableCell key={key} className="text-right tabular-nums">
          {r.walletCoins} <span className="text-muted-foreground">coins</span>
        </TableCell>
      );
    case "spent":
      return (
        <TableCell key={key} className="text-right tabular-nums">
          {fmt(Number(r.totalSpent))}
        </TableCell>
      );
    case "total":
      return (
        <TableCell key={key} className="text-right tabular-nums" title={r.prevOrderTotal != null ? `Plan before this one: ${fmt(Number(r.prevOrderTotal))}` : "No plan before this one"}>
          {fmt(Number(r.planTotal))}
        </TableCell>
      );
    case "prevPlanTotal":
      return (
        <TableCell key={key} className="text-right tabular-nums">
          {r.prevOrderTotal != null ? fmt(Number(r.prevOrderTotal)) : <span className="text-muted-foreground">—</span>}
        </TableCell>
      );
    case "actions":
      return (
        <TableCell key={key} className="text-right">
          <EstimateButton orderPublicId={r.orderPublicId} />
        </TableCell>
      );
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

export function RenewalsList({ rows, total, page, size, trial, today, spec }: { rows: RenewalRow[]; total: number; page: number; size: number; trial: boolean; today: string; spec: FacetDef[] }) {
  const tz = useTimezone();
  // SSR + skeleton use defaults; prefs hydrate after mount (one client reflow).
  const [visible, setVisible] = useState<PlanTableColumnKey[]>(() => [...DEFAULT_PLAN_TABLE_COLUMNS]);
  useEffect(() => {
    setVisible(loadPlanTableColumns());
  }, []);

  const columns = planTableColumnDefs(visible);
  const visibleSet = new Set(visible);

  function onColumnsChange(next: PlanTableColumnKey[]) {
    setVisible(savePlanTableColumns(next));
  }

  return (
    <div className="flex flex-col gap-4">
      <DataTable
        serialOffset={pageOffset(page, size)}
        columns={columns}
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
        actions={<RenewalsColumnsPicker visible={visible} onChange={onColumnsChange} />}
        emptyIcon={RefreshCwIcon}
        emptyMessage={trial ? "No trials in this date range. Pick a wider range or another date type." : "No plans in this date range. Pick a wider range or another date type."}
        emptySearchMessage="No plans match your search."
        renderRow={(r) => <>{visible.map((key) => planCell(key, r, today, trial, tz, visibleSet))}</>}
      />
      <ListPagination page={page} size={size} total={total} />
    </div>
  );
}

export function RenewalsListSkeleton() {
  return <DataTable.Skeleton columns={planTableColumnDefs(DEFAULT_PLAN_TABLE_COLUMNS)} hasId />;
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
        serialOffset={pageOffset(page, size)}
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
