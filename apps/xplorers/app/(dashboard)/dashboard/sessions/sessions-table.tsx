"use client";

import Link from "next/link";
import { Badge } from "@foundry/ui/badge";
import { TableCell } from "@foundry/ui/table";
import { DataTable, type Column } from "@foundry/design-system";
import { CalendarDaysIcon } from "lucide-react";
import { CATEGORY_LABELS, formatSessionDay, formatSessionTime } from "@/lib/sessions/format";
import type { SessionCategory } from "@/db/schema/studio";
import { PublishToggle } from "./publish-toggle";

export type SessionListRow = {
  publicId: string;
  title: string;
  category: SessionCategory;
  startsAt: Date;
  capacity: number;
  published: boolean;
  location: string | null;
};

type Col = "title" | "category" | "startsAt" | "capacity" | "published" | "actions";

const COLUMNS: readonly Column<Col>[] = [
  { key: "title", label: "Title" },
  { key: "category", label: "Category" },
  { key: "startsAt", label: "Starts" },
  { key: "capacity", label: "Capacity" },
  { key: "published", label: "Published" },
  { key: "actions", label: "", align: "right", width: "w-24" },
];

export function SessionsTable({
  rows,
  timeZone,
  canWrite,
}: {
  rows: SessionListRow[];
  timeZone: string;
  canWrite: boolean;
}) {
  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => r.publicId}
      serial={false}
      search={{
        placeholder: "Search title…",
        shortPlaceholder: "Search…",
        keys: ["title", "location"],
      }}
      emptyIcon={CalendarDaysIcon}
      emptyMessage="No sessions yet."
      emptySearchMessage="No sessions match your search."
      renderRow={(row) => (
        <>
          <TableCell className="font-medium">
            <Link href={`/dashboard/sessions/${row.publicId}`} className="hover:underline">
              {row.title}
            </Link>
          </TableCell>
          <TableCell>{CATEGORY_LABELS[row.category]}</TableCell>
          <TableCell className="whitespace-nowrap">
            {formatSessionDay(row.startsAt, timeZone)} · {formatSessionTime(row.startsAt, timeZone)}
          </TableCell>
          <TableCell>{row.capacity}</TableCell>
          <TableCell>
            {canWrite ? (
              <PublishToggle publicId={row.publicId} published={row.published} />
            ) : (
              <Badge variant={row.published ? "default" : "outline"}>{row.published ? "Published" : "Draft"}</Badge>
            )}
          </TableCell>
          <TableCell className="text-right">
            <Link href={`/dashboard/sessions/${row.publicId}`} className="text-sm underline-offset-4 hover:underline">
              {canWrite ? "Edit" : "View"}
            </Link>
          </TableCell>
        </>
      )}
    />
  );
}

export function SessionsTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} serial={false} />;
}
