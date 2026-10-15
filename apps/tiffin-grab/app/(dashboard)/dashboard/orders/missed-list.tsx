"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarClockIcon, CircleCheckIcon, GiftIcon, TruckIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { TableCell } from "@foundry/ui/table";
import { DataTable, ResponsiveDialog, RowActionTooltipButton, type Column } from "@/components/ds";
import { humanDate } from "@/lib/deliveries-view";
import type { MissedDeliveryRow } from "@/lib/services/missed-deliveries.service";
import type { ActionResult } from "@/app/(customer)/me/action-result";
import { setDeliveryStatusAction } from "./[id]/actions";
import { moveMissedAction, reconcileMissedAction } from "./missed-actions";
import { DateInput } from "@/components/dashboard/date-fields";

const COLUMNS: readonly Column<"date" | "customer" | "order" | "tiffins" | "why" | "actions">[] = [
  { key: "date", label: "Day" },
  { key: "customer", label: "Customer" },
  { key: "order", label: "Order" },
  { key: "tiffins", label: "Tiffins", align: "right" },
  { key: "why", label: "Why" },
  { key: "actions", label: "", align: "right" },
];

const WHY: Record<MissedDeliveryRow["kind"], string> = {
  not_sent: "Never sent to OptimoRoute",
  no_confirmation: "Sent, no confirmation",
};

/**
 * Past days nobody confirmed went out. Staff settle each one: it did go out (Mark delivered), it
 * did not and the tiffin goes on another day (Move), or the customer gets a free tiffin for it
 * (on the order page, where the dialog knows the plan's days).
 */
export function MissedList({ rows, isAdmin, today }: { rows: MissedDeliveryRow[]; isAdmin: boolean; today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [moving, setMoving] = useState<MissedDeliveryRow | null>(null);
  const [date, setDate] = useState("");
  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if ("error" in res) return void toast.error(res.error);
      toast.success(res.message ?? "Done");
      after?.();
      router.refresh();
    });

  return (
    <div className="space-y-3">
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-sm">Ask OptimoRoute what happened on these days. Confirmed stops drop off this list.</p>
          <Button size="sm" disabled={pending} onClick={() => run(reconcileMissedAction)}>
            {pending ? "Checking…" : "Reconcile with OptimoRoute"}
          </Button>
        </div>
      )}
      <DataTable
        pagination="client"
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.deliveryPublicId}
        emptyIcon={TruckIcon}
        emptyMessage="No missed deliveries. Every past day is confirmed."
        renderRow={(r) => (
          <>
            <TableCell className="whitespace-nowrap">{humanDate(r.deliveryDate)}</TableCell>
            <TableCell className="font-medium">{r.customerName}</TableCell>
            <TableCell>
              <Link href={`/dashboard/orders/${r.orderPublicId}`} className="hover:underline">{r.orderCode}</Link>
              <span className="text-muted-foreground block text-xs">{r.planName}</span>
            </TableCell>
            <TableCell className="text-right tabular-nums">{r.tiffinUnits}</TableCell>
            <TableCell>
              <Badge variant={r.kind === "not_sent" ? "destructive" : "secondary"}>{WHY[r.kind]}</Badge>
              {r.driver && <span className="text-muted-foreground block text-xs">{r.driver}</span>}
            </TableCell>
            <TableCell>
              <div className="flex justify-end gap-1">
                {isAdmin && (
                  <RowActionTooltipButton
                    icon={CircleCheckIcon}
                    label="Mark delivered"
                    hint="It went out: mark delivered"
                    tone="text-emerald-600"
                    disabled={pending}
                    onClick={() => run(() => setDeliveryStatusAction(r.deliveryPublicId, "delivered"))}
                  />
                )}
                <RowActionTooltipButton
                  icon={CalendarClockIcon}
                  label="Move"
                  hint="Not delivered: move the tiffin to another day"
                  disabled={pending}
                  onClick={() => { setDate(""); setMoving(r); }}
                />
                {isAdmin && (
                  <RowActionTooltipButton
                    icon={GiftIcon}
                    label="Free tiffin"
                    hint="Give a free tiffin for this day"
                    onClick={() => router.push(`/dashboard/orders/${r.orderPublicId}?free=${r.deliveryPublicId}`)}
                  />
                )}
              </div>
            </TableCell>
          </>
        )}
      />
      <ResponsiveDialog
        open={moving != null}
        onOpenChange={(o) => { if (!o) setMoving(null); }}
        title="Move the missed tiffin"
        description={moving ? `${moving.customerName} · ${moving.orderCode} · ${humanDate(moving.deliveryDate)} did not go out. Pick the day it goes instead.` : undefined}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setMoving(null)}>Cancel</Button>
            <Button
              disabled={pending || !date || !moving}
              onClick={() => moving && run(() => moveMissedAction(moving.deliveryPublicId, date), () => setMoving(null))}
            >
              {pending ? "Moving…" : "Move"}
            </Button>
          </div>
        }
      >
        <DateInput min={today} value={date} onChange={setDate} aria-label="Day to move the tiffin to" className="w-48" />
      </ResponsiveDialog>
    </div>
  );
}
