"use client";

import { useState, type ReactNode } from "react";
import { Pagination } from "@foundry/design-system";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@foundry/ui/table";
import { cn } from "@foundry/ui/cn";

export type PagedColumn = { key: string; label: string; className?: string };

/**
 * Small client-paginated shadcn table. State is local (not in the URL) so it can sit next to other
 * URL-paginated tables (the activity log owns ?page/?size on the order page).
 */
export function PagedTable<Row>({
  columns, rows, rowKey, renderRow, onRowClick, selected, empty, sizes = [10, 25, 50], initialSize = 10,
}: {
  columns: readonly PagedColumn[];
  rows: Row[];
  rowKey: (r: Row) => string;
  renderRow: (r: Row) => ReactNode;
  onRowClick?: (r: Row) => void;
  selected?: (r: Row) => boolean;
  empty: string;
  sizes?: readonly number[];
  initialSize?: number;
}) {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(initialSize);
  const pageCount = Math.max(1, Math.ceil(rows.length / size));
  const safe = Math.min(page, pageCount);
  const shown = rows.slice((safe - 1) * size, safe * size);
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>{columns.map((c) => <TableHead key={c.key} className={c.className}>{c.label}</TableHead>)}</TableRow>
          </TableHeader>
          <TableBody>
            {shown.length === 0 ? (
              <TableRow><TableCell colSpan={columns.length} className="text-muted-foreground py-6 text-center text-sm">{empty}</TableCell></TableRow>
            ) : shown.map((r) => (
              <TableRow
                key={rowKey(r)}
                data-testid="paged-row"
                className={cn(onRowClick && "cursor-pointer", selected?.(r) && "bg-muted")}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
              >
                {renderRow(r)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="text-muted-foreground flex items-center gap-2 tabular-nums">
          <span>{rows.length === 0 ? 0 : (safe - 1) * size + 1}–{Math.min(rows.length, safe * size)} of {rows.length}</span>
          <Select value={String(size)} onValueChange={(v) => (setSize(Number(v)), setPage(1))}>
            <SelectTrigger className="h-8 w-[4.5rem]" aria-label="Rows per page"><SelectValue /></SelectTrigger>
            <SelectContent>{sizes.map((s) => <SelectItem key={s} value={String(s)}>{s}</SelectItem>)}</SelectContent>
          </Select>
          <span>per page</span>
        </div>
        <Pagination page={safe} pageCount={pageCount} onPage={setPage} />
      </div>
    </div>
  );
}
