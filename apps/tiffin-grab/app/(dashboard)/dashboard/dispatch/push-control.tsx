"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DownloadIcon, SendIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Badge } from "@foundry/ui/badge";
import { TableCell } from "@foundry/ui/table";
import { DataTable, type Column } from "@/components/ds";
import { pullRoutesAction, pushDayAction } from "./actions";
import type { PushResult } from "@/lib/services/optimoroute/push";
import type { PullResult } from "@/lib/services/optimoroute/pull";

const FAILED_COLUMNS: readonly Column<"customer">[] = [{ key: "customer", label: "Customer" }];

export function PushControl({ date, stops }: { date: string; stops: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<PushResult | null>(null);
  const [pull, setPull] = useState<PullResult | null>(null);

  function run() {
    startTransition(async () => {
      try {
        const res = await pushDayAction(date);
        setResult(res);
        if (res.failed === 0) toast.success(`Sent ${res.pushed} stop${res.pushed === 1 ? "" : "s"}`);
        else toast.error(`${res.failed} of ${res.pushed + res.failed} stops failed`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Push failed");
      }
    });
  }

  function runPull() {
    startTransition(async () => {
      try {
        const res = await pullRoutesAction(date);
        setPull(res);
        toast.success(
          res.matched > 0
            ? `Assigned ${res.matched} stop${res.matched === 1 ? "" : "s"} to drivers`
            : "No planned routes found for this date yet",
        );
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Pull failed");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={run} disabled={pending || stops === 0}>
          <SendIcon data-icon="inline-start" />
          {pending ? "Sending…" : `Send ${stops} stop${stops === 1 ? "" : "s"}`}
        </Button>
        <Button variant="outline" onClick={runPull} disabled={pending}>
          <DownloadIcon data-icon="inline-start" /> Pull planned routes
        </Button>
        <p className="text-muted-foreground text-sm">
          Send creates and updates only. Pull reads driver and stop order back — labels then
          print in van-loading order.
        </p>
      </div>

      {pull ? (
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">Assigned {pull.matched}</Badge>
          {pull.cleared > 0 ? <Badge variant="outline">Cleared {pull.cleared}</Badge> : null}
          {pull.unknownOrderNos.length > 0 ? (
            <Badge variant="outline">
              {pull.unknownOrderNos.length} stop(s) on OptimoRoute we did not create
            </Badge>
          ) : null}
        </div>
      ) : null}

      {result ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Sent {result.pushed}</Badge>
            {result.failed > 0 ? <Badge variant="destructive">Failed {result.failed}</Badge> : null}
            {result.staleCount > 0 ? (
              <Badge variant="outline">{result.staleCount} stale left in place</Badge>
            ) : null}
          </div>
          {result.failed > 0 ? (
            <DataTable
              columns={FAILED_COLUMNS}
              rows={result.outcomes.filter((o) => !o.ok)}
              rowKey={(o) => o.orderNo}
              serial={false}
              emptyIcon={TriangleAlertIcon}
              emptyMessage="Nothing failed."
              renderRow={(o) => (
                <TableCell className="font-medium">
                  {o.customerName}
                  <span className="text-muted-foreground block text-xs font-normal">{o.message}</span>
                </TableCell>
              )}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
