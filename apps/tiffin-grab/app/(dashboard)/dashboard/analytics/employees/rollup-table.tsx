"use client";

import Link from "next/link";
import { UsersIcon } from "lucide-react";
import { DataTable, type Column } from "@/components/ds";
import { TableCell } from "@foundry/ui/table";
import { inquiriesHref } from "@/lib/analytics/drill";
import { useFormatMoney } from "@/components/app-currency";
import type { EmployeeRow } from "@/lib/analytics/employees.service";
import type { AnalyticsScope } from "@/lib/analytics/scope-types";
import { HoverHint } from "@/components/ds/hover-hint";

const COLUMNS: readonly Column<"rep" | "revenue" | "orders" | "renewal" | "actions" | "leads" | "converted" | "rate" | "tickets" | "resolution" | "coupons">[] = [
  { key: "rep", label: "Rep" },
  { key: "revenue", label: "Revenue owned", align: "right" },
  { key: "orders", label: "Orders owned", align: "right" },
  { key: "renewal", label: "Renewal rate", align: "right" },
  { key: "actions", label: "Actions", align: "right" },
  { key: "leads", label: "Leads worked", align: "right" },
  { key: "converted", label: "Converted", align: "right" },
  { key: "rate", label: "Conversion rate", align: "right" },
  { key: "tickets", label: "Tickets resolved", align: "right" },
  { key: "resolution", label: "Avg. resolution", align: "right" },
  { key: "coupons", label: "Rep-daily coupons", align: "right" },
];

export function EmployeeRollupTable({ rows, scope }: { rows: EmployeeRow[]; scope: AnalyticsScope }) {
  const money = useFormatMoney();
  return (
    <DataTable
      pagination="client"
      serial={false}
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => r.userId}
      emptyIcon={UsersIcon}
      emptyMessage="No data yet."
      renderRow={(r) => (
        <>
          <TableCell className="font-medium">
            {r.publicId ? <Link href={inquiriesHref(scope, { owner: r.publicId })} className="hover:underline">{r.name}</Link> : r.name}
          </TableCell>
          <TableCell numeric className="text-right tabular-nums">{money(r.revenueOwned)}</TableCell>
          <TableCell numeric className="text-right tabular-nums">{r.ordersOwned}</TableCell>
          <TableCell numeric className="text-right tabular-nums">{r.renewalRatePct != null ? `${r.renewalRatePct}%` : "—"}</TableCell>
          <TableCell numeric className="text-right tabular-nums">{r.actions}</TableCell>
          <TableCell numeric className="text-right tabular-nums">
            {r.publicId ? (
              <Link href={inquiriesHref(scope, { owner: r.publicId })} className="hover:underline">{r.leadsWorked}</Link>
            ) : (
              r.leadsWorked
            )}
          </TableCell>
          <TableCell numeric className="text-right tabular-nums">
            {r.publicId ? (
              <Link href={inquiriesHref(scope, { owner: r.publicId, stage: "converted" })} className="hover:underline">
                {r.leadsConverted}
              </Link>
            ) : (
              r.leadsConverted
            )}
          </TableCell>
          <TableCell numeric className="text-right tabular-nums">{r.conversionRatePct}%</TableCell>
          <TableCell numeric className="text-right tabular-nums">
            <HoverHint text="Opens this rep's resolved and closed tickets, not limited to the range">
              <Link
                href={`/dashboard/tickets?status=resolved,closed&owner=${encodeURIComponent(r.name)}`}
                className="hover:underline"
              >
                {r.ticketsResolved}
              </Link>
            </HoverHint>
          </TableCell>
          <TableCell numeric className="text-right tabular-nums">
            {r.avgResolutionHours != null ? `${r.avgResolutionHours}h` : "—"}
          </TableCell>
          <TableCell numeric className="text-right tabular-nums">{r.repDailyCoupons}</TableCell>
        </>
      )}
    />
  );
}
