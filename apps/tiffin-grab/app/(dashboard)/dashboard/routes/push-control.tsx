"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2Icon, DownloadIcon, SendIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Badge } from "@foundry/ui/badge";
import { pullCompletionsAction, pullRoutesAction, pushDayAction } from "./actions";
import type { PushResult } from "@/lib/services/optimoroute/push";
import type { PullResult } from "@/lib/services/optimoroute/pull";
import type { PullCompletionsResult } from "@/lib/services/optimoroute/completions";

export function PushControl({ date, stops }: { date: string; stops: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<PushResult | null>(null);
  const [pull, setPull] = useState<PullResult | null>(null);
  const [completions, setCompletions] = useState<PullCompletionsResult | null>(null);

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
        <Button onClick={run} disabled={pending || stops === 0}>
          <SendIcon data-icon="inline-start" />
          {pending ? "Sending…" : `Send ${stops} stop${stops === 1 ? "" : "s"}`}
        </Button>
        <Button variant="outline" onClick={runPull} disabled={pending}>
          <DownloadIcon data-icon="inline-start" /> Pull planned routes
        </Button>
        <Button variant="outline" onClick={runCompletions} disabled={pending}>
          <CheckCircle2Icon data-icon="inline-start" /> Pull completions
        </Button>
        <p className="text-muted-foreground text-sm">
          Send creates and updates only. Pull reads driver and stop order back — labels then
          print in van-loading order. Pull completions reads proof-of-delivery status; a
          failed stop is skipped the same way a dispatcher would skip it by hand.
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
            {completions.unmatchedCount > 0 ? (
              <Badge variant="outline">{completions.unmatchedCount} not found on OptimoRoute</Badge>
            ) : null}
            {completions.ambiguous.length > 0 ? (
              <Badge variant="outline">{completions.ambiguous.length} phone match(es) need review</Badge>
            ) : null}
          </div>
          {completions.outcomes.filter((o) => o.action !== "confirmed").length > 0 ? (
            <ul className="space-y-1 text-xs">
              {completions.outcomes
                .filter((o) => o.action !== "confirmed")
                .map((o) => (
                  <li key={o.deliveryPublicId}>
                    <span className="font-medium">{o.customerName}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      —{" "}
                      {o.action === "skipped"
                        ? o.optimoStatus === "failed"
                          ? "marked skipped (OptimoRoute reported failed)"
                          : "marked skipped (no confirmation by cutoff)"
                        : `not skipped: ${o.skipError}`}
                    </span>
                  </li>
                ))}
            </ul>
          ) : null}
          {completions.ambiguous.length > 0 ? (
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
            <ul className="space-y-1 text-xs">
              {result.outcomes
                .filter((o) => !o.ok)
                .map((o) => (
                  <li key={o.orderNo}>
                    <span className="font-medium">{o.customerName}</span>
                    <span className="text-muted-foreground"> — {o.message}</span>
                  </li>
                ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
