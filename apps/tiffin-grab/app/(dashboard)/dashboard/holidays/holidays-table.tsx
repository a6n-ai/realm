"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarOffIcon, CalendarPlusIcon } from "lucide-react";
import { TableCell } from "@foundry/ui/table";
import { DataTable, RowActions, TonePill, type Column, type FacetDef } from "@/components/ds";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import { humanDate } from "@/lib/deliveries-view";
import { parseSort, sortRows } from "@/lib/list/sort";
import type { HolidayRow, NeedsPlacingRow } from "@/lib/services/holidays.service";
import { HolidayRowActions } from "./holiday-row-actions";
import { PlaceForm } from "./place-form";

export type HolidayListRow = HolidayRow & { needsPlacing: number };

type Key = "date" | "name" | "organization" | "closed" | "needsPlacing" | "declaredBy" | "status";

const COLUMNS: readonly Column<Key | "actions">[] = [
  { key: "date", label: "Date", sortable: true, width: "w-28" },
  { key: "name", label: "Name", sortable: true, width: "w-72" },
  { key: "organization", label: "Organization", sortable: true, width: "w-32" },
  { key: "status", label: "Status", sortable: true, width: "w-24" },
  { key: "closed", label: "Closed", sortable: true, align: "right", width: "w-20" },
  { key: "needsPlacing", label: "To place", sortable: true, align: "right", width: "w-24" },
  { key: "declaredBy", label: "Declared by", sortable: true, width: "w-28" },
  { key: "actions", label: "", align: "right", width: "w-28" },
];
const SORT_KEYS = COLUMNS.filter((c) => c.sortable).map((c) => c.key) as Key[];

type When = "upcoming" | "today" | "past";
const WHEN: Record<When, string> = { upcoming: "Upcoming", today: "Today", past: "Past" };
const whenOf = (date: string, today: string): When => (date > today ? "upcoming" : date === today ? "today" : "past");

const VALUE: Record<Key, (r: HolidayListRow) => string | number | null> = {
  date: (r) => r.date,
  name: (r) => r.name,
  organization: (r) => r.organizationName,
  status: (r) => r.date,
  closed: (r) => r.closed,
  needsPlacing: (r) => r.needsPlacing,
  declaredBy: (r) => r.declaredBy,
};

const picked = (v: string | null) => (v ?? "").split(",").filter(Boolean);

export function HolidaysTable({ rows, today }: { rows: HolidayListRow[]; today: string }) {
  const sp = useSearchParams();
  const sortParam = sp.get("sort") ?? undefined;
  const dirParam = sp.get("dir") ?? undefined;
  const whenParam = sp.get("when");
  const orgParam = sp.get("organization");

  const spec = useMemo<FacetDef[]>(() => {
    const orgs = [...new Map(rows.map((r) => [r.organizationId, r.organizationName])).entries()];
    return [
      { kind: "multi", field: "when", label: "When", options: (Object.keys(WHEN) as When[]).map((value) => ({ value, label: WHEN[value] })) },
      ...(orgs.length > 1 ? [{ kind: "multi" as const, field: "organization", label: "Organization", options: orgs.map(([value, label]) => ({ value, label })) }] : []),
    ];
  }, [rows]);

  const shown = useMemo(() => {
    const whens = picked(whenParam);
    const orgs = picked(orgParam);
    const filtered = rows.filter((r) => (!whens.length || whens.includes(whenOf(r.date, today))) && (!orgs.length || orgs.includes(r.organizationId)));
    const sort = parseSort({ sort: sortParam, dir: dirParam }, SORT_KEYS, { column: "date", dir: "desc" });
    return { sort, rows: sortRows(filtered, sort, (r, column) => VALUE[column](r)) };
  }, [rows, today, whenParam, orgParam, sortParam, dirParam]);

  return (
    <DataTable
      columns={COLUMNS}
      rows={shown.rows}
      rowKey={(r) => r.publicId}
      sort={shown.sort}
      rowClassName={() => "group/row"}
      search={{ keys: ["name", "organizationName", "declaredBy", "date"], placeholder: "Search holiday, organization, staff…", shortPlaceholder: "Search…" }}
      filters={<ReuiFacetFilters spec={spec} />}
      pagination="client"
      emptyIcon={CalendarOffIcon}
      emptyMessage="No holidays yet. Declare one and every delivery on that day is paused and added back at the end of its plan."
      emptySearchMessage="No holidays match your search."
      renderRow={(r) => {
        const when = whenOf(r.date, today);
        return (
          <>
            <TableCell className="whitespace-nowrap tabular-nums">{humanDate(r.date)}</TableCell>
            <TableCell className="font-medium" title={r.name}>{r.name}</TableCell>
            <TableCell className="text-muted-foreground">{r.organizationName}</TableCell>
            <TableCell><TonePill tone={when === "past" ? "neutral" : when === "today" ? "warn" : "brand"}>{WHEN[when]}</TonePill></TableCell>
            <TableCell className="text-right tabular-nums">{r.closed}</TableCell>
            <TableCell className="text-right tabular-nums">{r.needsPlacing}</TableCell>
            <TableCell className="text-muted-foreground">{r.declaredBy ?? "-"}</TableCell>
            <TableCell className="text-right">
              <RowActions>
                <HolidayRowActions publicId={r.publicId} name={r.name} canReapply={r.date >= today} canRemove={r.date > today} />
              </RowActions>
            </TableCell>
          </>
        );
      }}
    />
  );
}

export function HolidaysTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} />;
}

const PLACING_COLUMNS: readonly Column<"closedDay" | "order" | "customer" | "tiffins" | "why" | "actions">[] = [
  { key: "closedDay", label: "Closed day" },
  { key: "order", label: "Order" },
  { key: "customer", label: "Customer" },
  { key: "tiffins", label: "Tiffins", align: "right" },
  { key: "why", label: "Why" },
  { key: "actions", label: "Place from", align: "right", width: "w-72" },
];

const reasonFor = (w: NeedsPlacingRow) =>
  w.trial ? "Trial: never placed automatically." : w.held ? "Kitchen was closed that day; the tiffin is still held." : "No free day, or another plan is in the way.";

export function NeedsPlacingTable({ rows, today }: { rows: NeedsPlacingRow[]; today: string }) {
  return (
    <DataTable
      columns={PLACING_COLUMNS}
      rows={rows}
      rowKey={(w) => w.deliveryPublicId}
      pagination="client"
      emptyIcon={CalendarPlusIcon}
      emptyMessage="Nothing waiting to be placed."
      renderRow={(w) => (
        <>
          <TableCell className="whitespace-nowrap">{humanDate(w.date)} · {w.holidayName}</TableCell>
          <TableCell className="font-mono text-xs">
            <Link className="hover:underline" href={`/dashboard/orders/${w.orderPublicId}`}>{w.orderCode}</Link>
          </TableCell>
          <TableCell>{w.customerName}</TableCell>
          <TableCell className="text-right tabular-nums">{w.tiffins}</TableCell>
          <TableCell className="text-muted-foreground text-sm">{reasonFor(w)}</TableCell>
          <TableCell><PlaceForm deliveryPublicId={w.deliveryPublicId} today={today} /></TableCell>
        </>
      )}
    />
  );
}
