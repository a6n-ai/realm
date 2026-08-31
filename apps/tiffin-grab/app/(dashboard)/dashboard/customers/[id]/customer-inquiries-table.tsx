"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardListIcon } from "lucide-react";
import { DataTable, SearchInput, StageBadge, type Column } from "@/components/ds";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@realm/ui/select";
import { TableCell } from "@realm/ui/table";
import { formatEpoch } from "@/lib/format/datetime";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { getCustomer360 } from "@/lib/services/customers.service";

type CustomerInquiryRow = Awaited<ReturnType<typeof getCustomer360>>["inquiries"][number];

// Same DataTable shape as the standalone /dashboard/inquiries table (see
// inquiries-list.tsx) — a read-only, unpaginated slice scoped to one customer, so it
// drops the Owner/reassign and Last touch/Next action columns that view has.
export const CUSTOMER_INQUIRIES_COLUMNS: readonly Column<"name" | "source" | "stage" | "created">[] = [
  { key: "name", label: "Name", sortable: false },
  { key: "source", label: "Source" },
  { key: "stage", label: "Stage" },
  { key: "created", label: "Created", align: "right" },
];

// Local state, not DataTable's URL-bound `search` prop — see customer-orders-table.tsx.
export function CustomerInquiriesTable({ inquiries }: { inquiries: CustomerInquiryRow[] }) {
  const tz = useTimezone();
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("all");

  const stages = useMemo(() => [...new Set(inquiries.map((i) => i.stage))], [inquiries]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return inquiries.filter((i) => {
      if (stage !== "all" && i.stage !== stage) return false;
      if (!needle) return true;
      return [i.fullName, i.source].some((v) => v.toLowerCase().includes(needle));
    });
  }, [inquiries, q, stage]);

  return (
    <DataTable
      columns={CUSTOMER_INQUIRIES_COLUMNS}
      rows={filtered}
      rowKey={(i) => i.publicId}
      idHref={(i) => `/dashboard/inquiries/${i.publicId}`}
      rowClassName={() => "group cursor-pointer"}
      emptyIcon={ClipboardListIcon}
      emptyMessage="No matching inquiries."
      emptySearchMessage="No inquiries match your search."
      filters={
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="Search name, source…" shortPlaceholder="Search…" />
          {stages.length > 1 && (
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger size="sm" className="w-36">
                <SelectValue placeholder="Stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                {stages.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      }
      renderRow={(i) => (
        <>
          <TableCell className="font-medium">
            <Link href={`/dashboard/inquiries/${i.publicId}`} className="group-hover:underline">
              {i.fullName}
            </Link>
          </TableCell>
          <TableCell>{i.source}</TableCell>
          <TableCell>
            <StageBadge stage={i.stage} />
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {formatEpoch(i.createdAt, { mode: "date", timeZone: tz })}
          </TableCell>
        </>
      )}
    />
  );
}
