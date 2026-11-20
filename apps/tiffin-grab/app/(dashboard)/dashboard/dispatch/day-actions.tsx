"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2Icon, DownloadIcon, SendIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Badge } from "@/components/reui/badge";
import { ListCard, ListCardRow } from "./list-card";
import { pullCompletionsAction, pullRoutesAction, pushDayAction, pushUnassignedAction } from "./actions";
import type { PushResult } from "@/lib/optimoroute/push";
import type { PullResult } from "@/lib/optimoroute/pull";
import type { PullCompletionsResult } from "@/lib/optimoroute/completions";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// The three OptimoRoute steps in the order a dispatcher runs them; each step keeps its own last result.
export function DayActions({ date, labelsCount, unassigned }: { date: string; labelsCount: number; unassigned: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [push, setPush] = useState<PushResult | null>(null);
  const [routes, setRoutes] = useState<PullResult | null>(null);
  const [done, setDone] = useState<PullCompletionsResult | null>(null);

  function act<T extends object>(call: () => Promise<T | { error: string }>, onOk: (r: T) => void, failMsg: string) {
    startTransition(async () => {
      try {
        const r = await call();
        if ("error" in r) {
          toast.error(r.error);
          return;
        }
        onOk(r as T);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : failMsg);
      }
    });
  }

  const send = (only?: string[]) =>
    act<PushResult>(
      () => (only ? pushUnassignedAction(date, only) : pushDayAction(date)),
      (r) => {
        setPush(r);
        if (r.failed === 0) toast.success(`Sent ${plural(r.pushed, "stop")}`);
        else toast.error(`${r.failed} of ${r.pushed + r.failed} stops failed`);
      },
      "Push failed",
    );

  const pullRoutes = () =>
    act<PullResult>(
      () => pullRoutesAction(date),
      (r) => {
        setRoutes(r);
        toast.success(r.matched > 0 ? `Assigned ${plural(r.matched, "stop")} to drivers` : "No planned routes found for this date yet");
      },
      "Pull failed",
    );

  const pullDone = () =>
    act<PullCompletionsResult>(
      () => pullCompletionsAction(date),
      (r) => {
        setDone(r);
        toast.success("Completions pulled");
      },
      "Completion pull failed",
    );

  const failedDrops = done ? done.outcomes.filter((o) => o.action !== "confirmed").length : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Step
          n={1}
          title="Send stops"
          help="Creates and updates the day's stops on OptimoRoute. Never deletes."
          action={
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => send()} disabled={pending || labelsCount === 0}>
                <SendIcon data-icon="inline-start" />
                {pending ? "Working…" : `Send ${plural(labelsCount, "stop")}`}
              </Button>
              <Button variant="outline" onClick={() => send(unassigned)} disabled={pending || unassigned.length === 0}>
                Push {unassigned.length} unassigned
              </Button>
            </div>
          }
        >
          {push ? (
            <>
              <Badge variant="success-light">Sent {push.pushed}</Badge>
              {push.failed > 0 ? <Badge variant="destructive-light">Failed {push.failed}</Badge> : null}
              {push.staleCount > 0 ? <Badge variant="warning-light">{push.staleCount} stale left in place</Badge> : null}
            </>
          ) : null}
        </Step>

        <Step
          n={2}
          title="Pull planned routes"
          help="Reads each stop's driver and order back, so labels print in van-loading order."
          action={
            <Button variant="outline" onClick={pullRoutes} disabled={pending}>
              <DownloadIcon data-icon="inline-start" /> Pull planned routes
            </Button>
          }
        >
          {routes ? (
            <>
              <Badge variant="success-light">Assigned {routes.matched}</Badge>
              {routes.cleared > 0 ? <Badge variant="secondary">Cleared {routes.cleared}</Badge> : null}
              {routes.unknownOrderNos.length > 0 ? (
                <Badge variant="warning-light">{plural(routes.unknownOrderNos.length, "stop")} we did not create</Badge>
              ) : null}
            </>
          ) : null}
        </Step>

        <Step
          n={3}
          title="Pull completions"
          help="Confirms what drivers delivered. Failed drops move to another day."
          action={
            <Button variant="outline" onClick={pullDone} disabled={pending}>
              <CheckCircle2Icon data-icon="inline-start" /> Pull completions
            </Button>
          }
        >
          {done ? (
            <>
              <Badge variant="success-light">{done.outcomes.length - failedDrops} confirmed</Badge>
              {failedDrops > 0 ? <Badge variant="destructive-light">{failedDrops} not delivered</Badge> : null}
              {done.pendingCount > 0 ? <Badge variant="info-light">{done.pendingCount} not closed yet</Badge> : null}
              {done.settled.length > 0 ? <Badge variant="secondary">{done.settled.length} already settled</Badge> : null}
            </>
          ) : null}
        </Step>
      </div>

      {push && push.failed > 0 ? (
        <ListCard title="Stops that failed to send">
          {push.outcomes
            .filter((o) => !o.ok)
            .map((o) => (
              <ListCardRow key={o.orderNo} primary={o.customerName} secondary={o.message} />
            ))}
        </ListCard>
      ) : null}
    </div>
  );
}

function Step({ n, title, help, action, children }: { n: number; title: string; help: string; action: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <span className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums">
          {n}
        </span>
        <p className="text-sm font-medium">{title}</p>
      </div>
      <p className="text-muted-foreground text-xs">{help}</p>
      <div className="mt-auto flex flex-col items-start gap-2">
        {action}
        {children ? <div className="flex flex-wrap gap-1">{children}</div> : null}
      </div>
    </div>
  );
}
