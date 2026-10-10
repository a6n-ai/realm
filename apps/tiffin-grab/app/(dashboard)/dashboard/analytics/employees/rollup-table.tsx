"use client";

import Link from "next/link";
import { UsersIcon } from "lucide-react";
import { DataTable, type Column } from "@/components/ds";
import { TableCell } from "@foundry/ui/table";
import { inquiriesHref } from "@/lib/analytics/drill";
import type { EmployeeRow } from "@/lib/services/analytics/employees.service";

const COLUMNS: readonly Column<"rep" | "leads" | "converted" | "rate" | "tickets" | "resolution" | "coupons">[] = [
  { key: "rep", label: "Rep" },
  { key: "leads", label: "Leads worked", align: "right" },
  { key: "converted", label: "Converted", align: "right" },
  { key: "rate", label: "Conversion rate", align: "right" },
  { key: "tickets", label: "Tickets resolved", align: "right" },
  { key: "resolution", label: "Avg. resolution", align: "right" },
  { key: "coupons", label: "Rep-daily coupons", align: "right" },
];

export function EmployeeRollupTable({ rows }: { rows: EmployeeRow[] }) {
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
            {r.publicId ? <Link href={inquiriesHref({ owner: r.publicId })} className="hover:underline">{r.name}</Link> : r.name}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {r.publicId ? (
              <Link href={inquiriesHref({ owner: r.publicId })} className="hover:underline">{r.leadsWorked}</Link>
            ) : (
              r.leadsWorked
            )}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {r.publicId ? (
              <Link href={inquiriesHref({ owner: r.publicId, stage: "converted" })} className="hover:underline">
                {r.leadsConverted}
              </Link>
            ) : (
              r.leadsConverted
            )}
          </TableCell>
          <TableCell className="text-right tabular-nums">{r.conversionRatePct}%</TableCell>
          <TableCell className="text-right tabular-nums">
            <Link
              href={`/dashboard/tickets?status=resolved&owner=${encodeURIComponent(r.name)}`}
              className="hover:underline"
            >
              {r.ticketsResolved}
            </Link>
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {r.avgResolutionHours != null ? `${r.avgResolutionHours}h` : "—"}
          </TableCell>
          <TableCell className="text-right tabular-nums">{r.repDailyCoupons}</TableCell>
        </>
      )}
    />
  );
}
