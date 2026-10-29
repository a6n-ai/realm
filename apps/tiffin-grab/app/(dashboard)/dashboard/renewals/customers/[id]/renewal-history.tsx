"use client";

import Link from "next/link";
import { BellIcon, CheckIcon, FlaskConicalIcon, PackageIcon } from "lucide-react";
import { formatMoney as fmt } from "@foundry/commons";
import { TableCell } from "@foundry/ui/table";
import { cn } from "@foundry/ui/cn";
import { Badge } from "@/components/reui/badge";
import { Timeline, TimelineContent, TimelineDate, TimelineHeader, TimelineIndicator, TimelineItem, TimelineSeparator, TimelineTitle } from "@/components/reui/timeline";
import { DataTable, type Column } from "@/components/ds";
import { useTimezone } from "@/components/providers/timezone-provider";
import { humanDate } from "@/lib/deliveries-view";
import { formatEpoch } from "@/lib/format/datetime";
import type { RenewalPlan, RenewalReminder } from "@/lib/services/renewals.service";
import { statusLabel } from "@/lib/renewals/filters";
import { UnpaidPlanActions } from "./renewal-actions";

const NEXT_VARIANT = { renewed: "success-light", unpaid: "warning-light", waitlisted: "info-light", none: "secondary" } as const;

function gapLabel(days: number) {
  if (days < 0) return `Booked ${-days} ${days === -1 ? "day" : "days"} before it ended`;
  if (days <= 1) return "Next plan started right after";
  return `${days} days until the next plan`;
}

/** Each plan on a vertical timeline (ReUI c-timeline pattern, as in the order activity log): dates, size, total, what followed. */
export function PlanHistory({ plans, today }: { plans: RenewalPlan[]; today: string }) {
  return (
    <Timeline defaultValue={plans.filter((p) => p.lastTiffin != null && p.lastTiffin < today).length}>
      {plans.map((p, i) => {
        const Icon = p.trial ? FlaskConicalIcon : p.lastTiffin != null && p.lastTiffin < today ? CheckIcon : PackageIcon;
        const isLast = i === plans.length - 1;
        return (
          <TimelineItem key={p.orderPublicId} step={i + 1} className="group-data-[orientation=vertical]/timeline:ms-10">
            <TimelineHeader>
              {!isLast && (
                <TimelineSeparator className="bg-input! group-data-[orientation=vertical]/timeline:-left-7 group-data-[orientation=vertical]/timeline:h-[calc(100%-1.75rem-0.25rem)] group-data-[orientation=vertical]/timeline:translate-y-7.5" />
              )}
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <TimelineTitle className="text-sm">
                  <Link href={`/dashboard/orders/${p.orderPublicId}`} className="hover:underline">{p.mealSize}</Link>
                  <span className="text-muted-foreground font-normal"> · {p.code}{p.trial ? " · trial" : ""}</span>
                </TimelineTitle>
                <TimelineDate className="mb-0 tabular-nums">
                  {humanDate(p.startDate)} – {p.lastTiffin ? humanDate(p.lastTiffin) : "no tiffins"}
                </TimelineDate>
              </div>
              <TimelineIndicator className="bg-card flex size-7 items-center justify-center border group-data-[orientation=vertical]/timeline:-left-7">
                <Icon className={cn("size-3.5", p.trial ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")} />
              </TimelineIndicator>
            </TimelineHeader>
            <TimelineContent>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground tabular-nums">{fmt(Number(p.total))}</span>
                <Badge variant={NEXT_VARIANT[p.next]}>{statusLabel(p.next, p.trial ? "trials" : "renewals")}</Badge>
                {p.gapDays != null && <span className="text-muted-foreground text-xs">{gapLabel(p.gapDays)}</span>}
              </div>
              {(p.status === "pending" || p.status === "waitlisted") && (
                <div className="mt-2">
                  <UnpaidPlanActions orderPublicId={p.orderPublicId} paymentPublicId={p.unpaidPaymentPublicId} />
                </div>
              )}
            </TimelineContent>
          </TimelineItem>
        );
      })}
    </Timeline>
  );
}

const REMINDER_COLUMNS: readonly Column<"sent" | "plan" | "when" | "status">[] = [
  { key: "sent", label: "Sent" },
  { key: "plan", label: "For plan" },
  { key: "when", label: "Reminder" },
  { key: "status", label: "Delivery" },
];

const DELIVERY_VARIANT = { sent: "success-light", pending: "secondary", processing: "info-light", failed: "destructive-light" } as const;

export function RenewalReminders({ reminders, plans }: { reminders: RenewalReminder[]; plans: RenewalPlan[] }) {
  const tz = useTimezone();
  const codeOf = new Map(plans.map((p) => [p.orderPublicId, `${p.mealSize} · ${p.code}`]));
  return (
    <DataTable
      columns={REMINDER_COLUMNS}
      rows={reminders}
      rowKey={(r) => `${r.sentAt}:${r.orderPublicId}:${r.daysLeft}`}
      emptyIcon={BellIcon}
      emptyMessage="No renewal reminder has gone to this customer yet."
      renderRow={(r) => (
        <>
          <TableCell className="tabular-nums">{formatEpoch(r.sentAt, { mode: "date", timeZone: tz })}</TableCell>
          <TableCell>{(r.orderPublicId && codeOf.get(r.orderPublicId)) ?? "—"}</TableCell>
          <TableCell>{r.byStaff ? "Sent by staff" : r.daysLeft == null ? "—" : r.daysLeft === 1 ? "1 day before the end" : `${r.daysLeft} days before the end`}</TableCell>
          <TableCell>
            <Badge variant={DELIVERY_VARIANT[r.status as keyof typeof DELIVERY_VARIANT] ?? "secondary"}>{r.status}</Badge>
          </TableCell>
        </>
      )}
    />
  );
}
