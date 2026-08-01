"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SendIcon } from "lucide-react";
import { Button } from "@realm/ui/button";
import { Badge } from "@realm/ui/badge";
import { pushDayAction } from "./actions";
import type { PushResult } from "@/lib/services/optimoroute/push";

export function PushControl({ date, stops }: { date: string; stops: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<PushResult | null>(null);

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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={run} disabled={pending || stops === 0}>
          <SendIcon data-icon="inline-start" />
          {pending ? "Sending…" : `Send ${stops} stop${stops === 1 ? "" : "s"}`}
        </Button>
        <p className="text-muted-foreground text-sm">
          Creates and updates only — nothing is removed from OptimoRoute.
        </p>
      </div>

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
