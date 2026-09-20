"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2Icon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Badge } from "@foundry/ui/badge";
import { TableCell } from "@foundry/ui/table";
import { Card, DataTable, DEFAULT_SIZE, PAGE_SIZES, type Column } from "@/components/ds";
import { ListCard, ListCardRow } from "./list-card";
import { pullCompletionsAction } from "./actions";
import type { PullCompletionsResult } from "@/lib/services/optimoroute/completions";

const OUTCOME_COLUMNS: readonly Column<"customer" | "status" | "action">[] = [
  { key: "customer", label: "Customer" },
  { key: "status", label: "OptimoRoute status" },
  { key: "action", label: "Outcome" },
];

// A page reads as one surface when it has exactly one real table — the outcomes list
// below owns DataTable's page-singleton `q`/`page`/`size` params. Unmatched/ambiguous
// are exceptions to review, not a browsable dataset, so they render as ListCard rows.
function outcomesPagination(sp: URLSearchParams) {
  const page = Math.max(0, Number.parseInt(sp.get("page") ?? "0", 10) || 0);
  const rawSize = Number.parseInt(sp.get("size") ?? String(DEFAULT_SIZE), 10);
  const size = (PAGE_SIZES as readonly number[]).includes(rawSize) ? rawSize : DEFAULT_SIZE;
  return { page, size };
}

export function CompletionsView({ date }: { date: string }) {
  const router = useRouter();
  const params = useSearchParams();
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
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">
              Confirmed {completions.outcomes.filter((o) => o.action === "confirmed").length}
            </Badge>
            {completions.outcomes.some((o) => o.action !== "confirmed") ? (
              <Badge variant="destructive">
                Not delivered{" "}
                {completions.outcomes.filter((o) => o.action !== "confirmed").length}
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
            columns={OUTCOME_COLUMNS}
            rows={completions.outcomes}
            rowKey={(o) => o.deliveryPublicId}
            serial={false}
            pagination={outcomesPagination(params)}
            search={{ placeholder: "Search customer…", keys: ["customerName"] }}
            emptyIcon={CheckCircle2Icon}
            emptyMessage="Nothing to act on for this date yet."
            renderRow={(o) => (
              <>
                <TableCell className="font-medium">
                  {o.customerName}
                  {o.coverage ? <span className="text-muted-foreground block text-xs">{o.coverage}</span> : null}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">{o.optimoStatus ?? "—"}</TableCell>
                <TableCell className="text-xs">
                  {o.action === "confirmed"
                    ? "Confirmed"
                    : o.redelivered
                      ? `Re-delivering all ${o.tiffinUnits} tiffin${o.tiffinUnits === 1 ? "" : "s"} on ${o.redelivered.targetDate}${o.redelivered.merged ? " (merged into that day's trip)" : ""}`
                      : o.action === "skipped"
                      ? `Skipped (${o.optimoStatus === "failed" ? "OptimoRoute reported failed" : "no confirmation by cutoff"})`
                      : `Not skipped: ${o.skipError}`}
                </TableCell>
              </>
            )}
          />

          {completions.unmatched.length > 0 ? (
            <ListCard title="Not found on OptimoRoute">
              {completions.unmatched.map((u) => (
                <ListCardRow
                  key={u.deliveryPublicId}
                  primary={u.customerName}
                  secondary="No OptimoRoute stop found for this date"
                />
              ))}
            </ListCard>
          ) : null}

          {completions.ambiguous.length > 0 ? (
            <ListCard title="Needs manual review">
              {completions.ambiguous.map((a) => (
                <ListCardRow
                  key={a.deliveryPublicId}
                  primary={a.deliveryPublicId}
                  secondary="Multiple OptimoRoute stops share this phone"
                  trailing={`${a.candidateCount} stops`}
                />
              ))}
            </ListCard>
          ) : null}
        </div>
      ) : (
        <Card variant="flat" className="flex flex-col items-center gap-2 p-8 text-center">
          <CheckCircle2Icon className="text-muted-foreground size-8" />
          <p className="text-muted-foreground text-sm">
            Pull completions to see today&apos;s proof-of-delivery status.
          </p>
        </Card>
      )}
    </div>
  );
}
