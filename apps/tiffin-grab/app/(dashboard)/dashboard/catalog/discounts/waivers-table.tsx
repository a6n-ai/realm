"use client";

import { useState } from "react";
import { InboxIcon, PencilIcon, PlusIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Badge } from "@foundry/ui/badge";
import { TableCell } from "@foundry/ui/table";
import { DataTable } from "@/components/ds";
import { WAIVER_LABELS, WaiverDialog } from "@/components/dashboard/waiver-dialog";
import type { WaiverKind } from "@/lib/catalog/types";
import { discountStatus, type DiscountDto } from "./build-rows";

const COLUMNS = [
  { key: "name", label: "Name" },
  { key: "waives", label: "Waives" },
  { key: "value", label: "Waived", align: "right" as const },
  { key: "status", label: "Status" },
  { key: "manage", label: "", align: "right" as const, width: "w-px" },
];

const STATUS_LABEL = { active: "Active", inactive: "Inactive", scheduled: "Scheduled", expired: "Expired" } as const;

export function WaiversTable({ waivers, strategies, now }: { waivers: DiscountDto[]; strategies: { publicId: string; name: string }[]; now: number }) {
  const [dialog, setDialog] = useState<{ waiver?: DiscountDto } | null>(null);
  const strategyName = new Map(strategies.map((s) => [s.publicId, s.name]));

  return (
    <div className="space-y-3">
      <DataTable
        columns={COLUMNS}
        rows={waivers}
        rowKey={(w) => w.publicId}
        serial={false}
        actions={<Button onClick={() => setDialog({})}><PlusIcon className="size-4" /> Add waiver</Button>}
        emptyIcon={InboxIcon}
        emptyMessage="No waivers yet. Waive delivery fees or cover the tax for a promo."
        renderRow={(w) => {
          const status = discountStatus(w, now);
          return (
            <>
              <TableCell className="font-medium">{w.name}</TableCell>
              <TableCell>
                {w.kind === "waiver_strategy" ? `${strategyName.get(w.targetPublicId ?? "") ?? "Unknown strategy"} fee` : WAIVER_LABELS[w.kind as WaiverKind]}
              </TableCell>
              <TableCell className="text-right tabular-nums">{w.percent}%</TableCell>
              <TableCell>
                <Badge variant={status === "active" ? "default" : "outline"} className="font-normal">{STATUS_LABEL[status]}</Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button size="sm" variant="ghost" onClick={() => setDialog({ waiver: w })}>
                  <PencilIcon className="size-3.5" /> Manage
                </Button>
              </TableCell>
            </>
          );
        }}
      />
      <WaiverDialog open={dialog != null} onOpenChange={(o) => !o && setDialog(null)} waiver={dialog?.waiver} strategies={strategies} />
    </div>
  );
}
