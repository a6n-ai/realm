"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArchiveIcon, TrashIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Badge } from "@foundry/ui/badge";
import { TableCell } from "@foundry/ui/table";
import { DataTable, DEFAULT_SIZE, PAGE_SIZES, ResponsiveDialog, type Column } from "@/components/ds";
import { removeStopsAction } from "./actions";
import type { PushPreview } from "@/lib/services/optimoroute/push";

const COLUMNS: readonly Column<"select" | "stop" | "status">[] = [
  { key: "select", label: "" },
  { key: "stop", label: "Order / driver" },
  { key: "status", label: "" },
];

function stalePagination(sp: URLSearchParams) {
  const page = Math.max(0, Number.parseInt(sp.get("page") ?? "0", 10) || 0);
  const rawSize = Number.parseInt(sp.get("size") ?? String(DEFAULT_SIZE), 10);
  const size = (PAGE_SIZES as readonly number[]).includes(rawSize) ? rawSize : DEFAULT_SIZE;
  return { page, size };
}

/**
 * Removal is opt-in per stop. There is no "remove all stale" button: the set is small,
 * each entry means a driver stops going somewhere, and the one-click version is the shape
 * that eventually empties a route by accident.
 */
export function RemoveControl({
  date,
  stale,
  scheduledCount,
}: {
  date: string;
  stale: PushPreview["remove"];
  scheduledCount: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const { page, size } = stalePagination(params);
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (orderNo: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orderNo)) next.delete(orderNo);
      else next.add(orderNo);
      return next;
    });

  // Removing every stop on a day that has nothing scheduled is exactly what a wrong date
  // looks like, so say so before rather than after.
  const emptyingTheDay = scheduledCount === 0 && selected.size === stale.length && stale.length > 0;

  function run() {
    startTransition(async () => {
      try {
        const res = await removeStopsAction(date, [...selected]);
        if (res.failed === 0) {
          toast.success(`Removed ${res.removed} stop${res.removed === 1 ? "" : "s"}`);
        } else {
          toast.error(`${res.failed} of ${res.removed + res.failed} removals failed`);
        }
        if (res.skipped.length > 0) {
          toast.info(`${res.skipped.length} stop(s) went live again and were left alone`);
        }
        setSelected(new Set());
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Removal failed");
      }
    });
  }

  if (stale.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="destructive"
          disabled={pending || selected.size === 0}
          onClick={() => setOpen(true)}
        >
          <TrashIcon data-icon="inline-start" /> Remove {selected.size || ""} selected
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => setSelected(new Set(stale.filter((s) => s.ours).map((s) => s.orderNo)))}
        >
          Select ours ({stale.filter((s) => s.ours).length})
        </Button>
      </div>

      <DataTable
        columns={COLUMNS}
        rows={stale}
        rowKey={(s) => s.orderNo}
        serial={false}
        pagination={{ page, size }}
        search={{ placeholder: "Search order or driver…", keys: ["orderNo", "driver"] }}
        emptyIcon={ArchiveIcon}
        emptyMessage="Nothing stale for this date."
        renderRow={(s) => (
          <>
            <TableCell>
              {/* Native checkbox: @foundry/ui has no Checkbox, and this needs nothing more. */}
              <input
                type="checkbox"
                id={`rm-${s.orderNo}`}
                checked={selected.has(s.orderNo)}
                onChange={() => toggle(s.orderNo)}
                disabled={pending}
                className="size-4 accent-destructive"
              />
            </TableCell>
            <TableCell>
              <label htmlFor={`rm-${s.orderNo}`} className="block cursor-pointer">
                <span className="block font-mono text-xs">{s.orderNo}</span>
                <span className="text-muted-foreground block text-xs">
                  {/* A foreign stop's address is another business's customer's home —
                      never render it here, whether or not this stop turns out to be ours. */}
                  {s.ours ? `${s.driver ?? "unassigned"} · ${s.address ?? "no address"}` : (s.driver ?? "unassigned")}
                </span>
              </label>
            </TableCell>
            <TableCell>
              {!s.ours ? (
                <div className="flex flex-col items-end gap-1">
                  {/* The OptimoRoute account is shared with another business, and the old
                      spreadsheet numbered stops by customer name — so most foreign stops are
                      not ours to delete. */}
                  <Badge variant="outline" className="text-[10px]">
                    not ours
                  </Badge>
                  {s.hint ? (
                    <Link
                      href={`/dashboard/customers/${s.hint.publicId}`}
                      target="_blank"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Badge
                        variant="secondary"
                        className="cursor-pointer text-[10px] hover:underline"
                      >
                        Possible match: {s.hint.name}
                        {s.hint.hasActiveOrder ? " · Active order" : ""}
                      </Badge>
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </TableCell>
          </>
        )}
      />

      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title={`Remove ${selected.size} stop${selected.size === 1 ? "" : "s"}?`}
        description={`They will be deleted from OptimoRoute for ${date}. Drivers will no longer be routed to them.`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={run} disabled={pending}>
              {pending ? "Removing…" : "Remove"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3 px-4 py-3">
          {emptyingTheDay ? (
            <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                Nothing is scheduled here for {date}, and this removes every stop OptimoRoute
                has. Check the date before confirming.
              </span>
            </p>
          ) : null}
          <ul className="max-h-56 space-y-1 overflow-y-auto text-xs">
            {[...selected].map((orderNo) => (
              <li key={orderNo} className="font-mono">
                {orderNo}
              </li>
            ))}
          </ul>
        </div>
      </ResponsiveDialog>
    </div>
  );
}
