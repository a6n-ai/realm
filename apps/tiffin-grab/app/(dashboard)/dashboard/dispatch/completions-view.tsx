"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2Icon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Badge } from "@foundry/ui/badge";
import { TableCell } from "@foundry/ui/table";
import { Card, DataTable, type Column } from "@/components/ds";
import { pullCompletionsAction } from "./actions";
import type { PullCompletionsResult } from "@/lib/services/optimoroute/completions";

const COLUMNS: readonly Column<"customer" | "status" | "action">[] = [
  { key: "customer", label: "Customer" },
  { key: "status", label: "OptimoRoute status" },
  { key: "action", label: "Outcome" },
];

export function CompletionsView({ date }: { date: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [completions, setCompletions] = useState<PullCompletionsResult | null>(null);

  function runCompletions() {
    startTransition(async () => {
      try {
        const res = await pullCompletionsAction(date);
        setCompletions(res);
        const skipped = res.outcomes.filter((o) => o.action !== "confirmed").length;
        toast.success(
          res.outcomes.length > 0
            ? `${res.outcomes.length} completion${res.outcomes.length === 1 ? "" : "s"} recorded${skipped > 0 ? ` (${skipped} not delivered → skipped)` : ""}`
            : "Nothing to act on for this date yet",
        );
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Completion pull failed");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={runCompletions} disabled={pending}>
          <CheckCircle2Icon data-icon="inline-start" /> Pull completions
        </Button>
        <p className="text-muted-foreground text-sm">
          Pull completions reads proof-of-delivery status; a failed stop is skipped the same way
          a dispatcher would skip it by hand.
        </p>
      </div>

      {completions ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              Confirmed {completions.outcomes.filter((o) => o.action === "confirmed").length}
            </Badge>
            {completions.outcomes.some((o) => o.action !== "confirmed") ? (
              <Badge variant="destructive">
                Not delivered → skipped{" "}
                {completions.outcomes.filter((o) => o.action === "skipped").length}
              </Badge>
            ) : null}
            {completions.pendingCount > 0 ? (
              <Badge variant="outline">{completions.pendingCount} too early to tell</Badge>
            ) : null}
            {completions.unmatched.length > 0 ? (
              <Badge variant="outline">{completions.unmatched.length} not found on OptimoRoute</Badge>
            ) : null}
            {completions.ambiguous.length > 0 ? (
              <Badge variant="outline">{completions.ambiguous.length} phone match(es) need review</Badge>
            ) : null}
          </div>

          <DataTable
            columns={COLUMNS}
            rows={completions.outcomes}
            rowKey={(o) => o.deliveryPublicId}
            serial={false}
            search={{ placeholder: "Search customer…", keys: ["customerName"] }}
            emptyIcon={CheckCircle2Icon}
            emptyMessage="Nothing to act on for this date yet."
            renderRow={(o) => (
              <>
                <TableCell className="font-medium">{o.customerName}</TableCell>
                <TableCell className="text-muted-foreground text-xs">{o.optimoStatus ?? "—"}</TableCell>
                <TableCell className="text-xs">
                  {o.action === "confirmed"
                    ? "Confirmed"
                    : o.action === "skipped"
                      ? `Skipped (${o.optimoStatus === "failed" ? "OptimoRoute reported failed" : "no confirmation by cutoff"})`
                      : `Not skipped: ${o.skipError}`}
                </TableCell>
              </>
            )}
          />

          {completions.unmatched.length > 0 ? (
            <Card variant="flat" className="space-y-2 p-4">
              <p className="text-sm font-medium">Not found on OptimoRoute</p>
              <ul className="space-y-1 text-xs">
                {completions.unmatched.map((u) => (
                  <li key={u.deliveryPublicId}>
                    <span className="font-medium">{u.customerName}</span>
                    <span className="text-muted-foreground"> — no OptimoRoute stop found for this date</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          {completions.ambiguous.length > 0 ? (
            <Card variant="flat" className="space-y-2 p-4">
              <p className="text-sm font-medium">Needs manual review</p>
              <ul className="space-y-1 text-xs">
                {completions.ambiguous.map((a) => (
                  <li key={a.deliveryPublicId}>
                    <span className="font-medium">{a.deliveryPublicId}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      — {a.candidateCount} OptimoRoute stops share this phone for this date, resolve manually
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
