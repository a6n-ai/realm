"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ListChecksIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { TableCell } from "@foundry/ui/table";
import { DataTable, DEFAULT_SIZE, PAGE_SIZES, ResponsiveDialog, type Column } from "@/components/ds";
import { GROUP_LABEL, type ReasonGroup } from "@/lib/services/optimoroute/reconcile-reason";
import type { DayLedger, LedgerRow } from "@/lib/services/optimoroute/ledger";
import { pushDeliveryAction, removeStopsAction } from "./actions";

type Key = "delivery" | "customer" | "ours" | "optimo" | "driver" | "reason" | "actions";

const COLUMNS: readonly Column<Key>[] = [
  { key: "delivery", label: "Delivery ID" },
  { key: "customer", label: "Customer" },
  { key: "ours", label: "Our status" },
  { key: "optimo", label: "OptimoRoute" },
  { key: "driver", label: "Driver / stop" },
  { key: "reason", label: "Reason" },
  { key: "actions", label: "" },
];

// Order of the filter chips = the order a dispatcher works through the day.
const GROUPS: ReasonGroup[] = ["needs_action", "on_route", "done", "not_today", "not_ours"];
const VARIANT: Record<ReasonGroup, "destructive" | "secondary" | "outline"> = {
  needs_action: "destructive",
  on_route: "secondary",
  done: "secondary",
  not_today: "outline",
  not_ours: "outline",
};

function pagination(sp: URLSearchParams) {
  const page = Math.max(0, Number.parseInt(sp.get("page") ?? "0", 10) || 0);
  const raw = Number.parseInt(sp.get("size") ?? String(DEFAULT_SIZE), 10);
  return { page, size: (PAGE_SIZES as readonly number[]).includes(raw) ? raw : DEFAULT_SIZE };
}

export function LedgerTable({ date, ledger }: { date: string; ledger: DayLedger }) {
  const router = useRouter();
  const params = useSearchParams();
  const view = params.get("view");
  // Default hides other businesses' stops; everything else is shown.
  const active: ReasonGroup | "all" = GROUPS.includes(view as ReasonGroup) ? (view as ReasonGroup) : "all";
  const [pending, startTransition] = useTransition();
  const [confirmRemove, setConfirmRemove] = useState<LedgerRow | null>(null);

  const rows = useMemo(
    () => ledger.rows.filter((r) => (active === "all" ? r.group !== "not_ours" : r.group === active)),
    [ledger.rows, active],
  );

  function setView(next: ReasonGroup | "all") {
    const sp = new URLSearchParams(params);
    if (next === "all") sp.delete("view");
    else sp.set("view", next);
    sp.delete("page");
    router.replace(`?${sp.toString()}`, { scroll: false });
  }

  function send(r: LedgerRow) {
    startTransition(async () => {
      const res = await pushDeliveryAction(r.deliveryPublicId!, date);
      if (res.ok) toast.success(`${r.customerName} sent to OptimoRoute`);
      else toast.error(res.message);
      router.refresh();
    });
  }

  function remove(r: LedgerRow) {
    startTransition(async () => {
      try {
        // Re-checks staleness against a fresh read, so a stop that went live again is left on the route.
        const res = await removeStopsAction(date, [r.deliveryPublicId!]);
        if (res.removed > 0) toast.success(`${r.customerName} removed from OptimoRoute`);
        else if (res.skipped.length > 0) toast.info(`${r.customerName} is no longer stale, left on the route`);
        else toast.error(`${r.customerName} could not be removed`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Remove failed");
      }
      setConfirmRemove(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by reason">
        <Button size="sm" variant={active === "all" ? "default" : "outline"} onClick={() => setView("all")}>
          All ours {ledger.rows.length - ledger.counts.not_ours}
        </Button>
        {GROUPS.map((g) => (
          <Button key={g} size="sm" variant={active === g ? "default" : "outline"} onClick={() => setView(g)} disabled={ledger.counts[g] === 0}>
            {GROUP_LABEL[g]} {ledger.counts[g]}
          </Button>
        ))}
      </div>

      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.key}
        serial={false}
        pagination={pagination(params)}
        search={{ placeholder: "Search customer, phone or delivery ID…", keys: ["customerName", "phone", "deliveryPublicId", "optimoOrderNo"] }}
        emptyIcon={ListChecksIcon}
        emptyMessage="Nothing in this group for the date."
        renderRow={(r) => (
          <>
            <TableCell className="font-mono text-xs">
              {r.deliveryPublicId ? (
                <Link href={`/dashboard/go/${r.deliveryPublicId}`} className="hover:underline">{r.deliveryPublicId}</Link>
              ) : (
                <span className="text-muted-foreground">{r.optimoOrderNo ?? "—"}</span>
              )}
            </TableCell>
            <TableCell className="font-medium">
              {r.customerName}
              {r.phone ? <span className="text-muted-foreground block text-xs">{r.phone}</span> : null}
              {r.orderId ? <span className="text-muted-foreground block text-xs">{r.orderId}</span> : null}
            </TableCell>
            <TableCell className="text-xs">{r.ourStatus ?? "—"}</TableCell>
            <TableCell className="text-xs">{r.optimoStatus ?? "Not on OptimoRoute"}</TableCell>
            <TableCell className="text-xs tabular-nums">
              {r.driver ? `${r.driver}${r.stopNumber != null ? ` · #${r.stopNumber}` : ""}` : "—"}
            </TableCell>
            <TableCell>
              <Badge variant={VARIANT[r.group]}>{GROUP_LABEL[r.group]}</Badge>
              <span className="mt-1 block text-xs">{r.reason}</span>
            </TableCell>
            <TableCell className="text-right">
              {r.action === "send" && r.deliveryPublicId ? (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => send(r)}>Send</Button>
              ) : r.action === "remove" && r.deliveryPublicId && r.optimoOrderNo === r.deliveryPublicId ? (
                <Button size="sm" variant="outline" disabled={pending} onClick={() => setConfirmRemove(r)}>Remove…</Button>
              ) : null}
            </TableCell>
          </>
        )}
      />

      <ResponsiveDialog
        open={confirmRemove != null}
        onOpenChange={(o) => !o && setConfirmRemove(null)}
        title="Remove from OptimoRoute?"
        description={confirmRemove ? `${confirmRemove.customerName} will be deleted from OptimoRoute for ${date}. The driver will no longer go there.` : undefined}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmRemove(null)} disabled={pending}>Keep</Button>
            <Button variant="destructive" onClick={() => confirmRemove && remove(confirmRemove)} disabled={pending}>
              {pending ? "Removing…" : "Remove"}
            </Button>
          </div>
        }
      >
        <p className="text-muted-foreground text-sm">{confirmRemove?.reason}</p>
      </ResponsiveDialog>
    </div>
  );
}
