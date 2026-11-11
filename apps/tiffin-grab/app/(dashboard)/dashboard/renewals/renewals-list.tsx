"use client";

import { useState } from "react";
import { daysBetween } from "@foundry/commons/util/dates";
import { pageOffset } from "@foundry/design-system/filters/parse-filter-state";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClockIcon, RefreshCwIcon, StickyNoteIcon, UsersIcon } from "lucide-react";
import { FactTag } from "./fact-tags";
import { formatMoney as fmt, zonedDateIso } from "@foundry/commons";
import { TableCell } from "@foundry/ui/table";
import { Badge } from "@/components/reui/badge";
import { DataTable, ListPagination, RowActionTooltipButton, type Column, type FacetDef } from "@/components/ds";
import { ListSearchFilters } from "@/components/filters/reui-facet-filters";
import { humanDate } from "@/lib/deliveries-view";
import { rowStatus, statusLabel, type PlanType, type RenewalRowStatus, type RenewalsTab } from "@/lib/renewals/filters";
import { isClosedTrack } from "@/lib/renewals/status";
import type { RenewalRow, RenewedCustomerRow } from "@/lib/services/renewals.service";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@foundry/design-system/timezone-provider";
import { EstimateButton } from "./estimate-button";
import { TrackStatusMenu, TrackStatusPill } from "./_track/track-status";
import { TrackNoteDialog, type TrackNoteKind } from "./_track/track-note-dialog";

type PlanColumn = "customer" | "plan" | "last" | "renewal" | "status" | "followUp" | "activity" | "coins" | "spent" | "total" | "actions";

const COLUMNS: readonly Column<PlanColumn>[] = [
  { key: "customer", label: "Customer", width: "w-48" },
  { key: "plan", label: "Meal size", width: "w-28" },
  { key: "last", label: "Last tiffin", width: "w-36" },
  { key: "renewal", label: "Renewal", width: "w-32" },
  { key: "status", label: "Status", width: "w-40" },
  { key: "followUp", label: "Follow-up", width: "w-36" },
  { key: "activity", label: "Last activity", width: "w-56" },
  { key: "coins", label: "Wallet", align: "right", width: "w-20" },
  { key: "spent", label: "Total spent", align: "right", width: "w-24" },
  { key: "total", label: "Last spent", align: "right", width: "w-24" },
  { key: "actions", label: "Actions", align: "right", width: "w-28" },
];

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

/** Add note and set follow-up for one plan; the dialog mounts only once opened. */
function RowTrackActions({ orderPublicId, customerPublicId, closed }: { orderPublicId: string; customerPublicId: string; closed: boolean }) {
  const [kind, setKind] = useState<TrackNoteKind | null>(null);
  return (
    <>
      <RowActionTooltipButton icon={StickyNoteIcon} label="Add note" hint="Log a note on this plan" onClick={() => setKind("note")} />
      {!closed && <RowActionTooltipButton icon={CalendarClockIcon} label="Set follow-up" hint="Schedule when to follow up on this plan" onClick={() => setKind("follow_up")} />}
      {kind && (
        <TrackNoteDialog
          orderPublicId={orderPublicId}
          customerPublicId={customerPublicId}
          kind={kind}
          open
          onOpenChange={(open) => !open && setKind(null)}
          closed={closed}
        />
      )}
    </>
  );
}

export function RenewalsList({ rows, total, page, size, type, today, spec }: { rows: RenewalRow[]; total: number; page: number; size: number; type: PlanType | null; today: string; spec: FacetDef[] }) {
  const tz = useTimezone();
  return (
    <div className="flex flex-col gap-4">
      <DataTable
        serialOffset={pageOffset(page, size)}
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
        emptyMessage={type === "trial" ? "No trials in this date range. Pick a wider range or another date type." : "No plans in this date range. Pick a wider range or another date type."}
        emptySearchMessage="No plans match your search."
        renderRow={(r) => {
          const renewal = rowStatus(r.status, r.lastTiffin, today);
          const followIso = r.nextFollowUpAt != null ? zonedDateIso(r.nextFollowUpAt, tz) : null;
          const overdue = followIso != null && followIso < today;
          return (
            <>
              <TableCell className="font-medium">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Link href={renewalHref(r)} className="group-hover:underline">{r.customerName}</Link>
                  {r.trial && <Badge variant="secondary">Trial</Badge>}
                  <FactTag fact="priorPlans" n={r.priorPlans} title={`Renewed ${r.priorPlans}× before`} />
                  <FactTag fact="holds" n={r.holds} title={`${r.holds} ${r.holds === 1 ? "day" : "days"} held or paused on this plan`} />
                  <FactTag fact="openTickets" n={r.openTickets} title={`${r.openTickets} open ${r.openTickets === 1 ? "ticket" : "tickets"}`} />
                </div>
              </TableCell>
              <TableCell>{r.mealSize}</TableCell>
              <TableCell className="tabular-nums" title={humanDate(r.lastTiffin)}>
                {humanDate(r.lastTiffin)} <span className="text-muted-foreground">· {whenLabel(r.lastTiffin, today)}</span>
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[renewal]}>{statusLabel(renewal)}</Badge>
              </TableCell>
              <TableCell>
                {r.customerPublicId ? (
                  <TrackStatusMenu orderPublicId={r.orderPublicId} customerPublicId={r.customerPublicId} status={r.track} source={r.trackSource} />
                ) : (
                  <TrackStatusPill status={r.track} source={r.trackSource} />
                )}
              </TableCell>
              <TableCell className="tabular-nums">
                {followIso ? (
                  <span className={overdue ? "text-destructive" : undefined}>
                    {humanDate(followIso)}
                    {overdue && <span className="text-xs"> · overdue</span>}
                  </span>
                ) : (
                  <span className="text-muted-foreground">None</span>
                )}
              </TableCell>
              <TableCell>
                {r.lastActivity ? (
                  <span className="text-muted-foreground block max-w-56 truncate text-xs" title={r.lastActivity.note ?? undefined}>
                    {r.lastActivity.note ?? ACTIVITY_LABEL[r.lastActivity.type] ?? r.lastActivity.type}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">None yet</span>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">{r.walletCoins} <span className="text-muted-foreground">coins</span></TableCell>
              <TableCell className="text-right tabular-nums">{fmt(Number(r.totalSpent))}</TableCell>
              <TableCell className="text-right tabular-nums" title={r.prevOrderTotal != null ? `Plan before this one: ${fmt(Number(r.prevOrderTotal))}` : "No plan before this one"}>
                {fmt(Number(r.planTotal))}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {r.customerPublicId && <RowTrackActions orderPublicId={r.orderPublicId} customerPublicId={r.customerPublicId} closed={isClosedTrack(r.track)} />}
                  <EstimateButton orderPublicId={r.orderPublicId} />
                </div>
              </TableCell>
            </>
          );
        }}
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
