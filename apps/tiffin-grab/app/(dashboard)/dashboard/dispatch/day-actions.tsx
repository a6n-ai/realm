"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2Icon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { PushControl } from "./push-control";
import { pullCompletionsAction } from "./actions";

export function DayActions({ date, labelsCount, unassigned }: { date: string; labelsCount: number; unassigned: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function pull() {
    startTransition(async () => {
      try {
        const r = await pullCompletionsAction(date);
        const failed = r.outcomes.filter((o) => o.action !== "confirmed").length;
        toast.success(
          `${r.outcomes.length - failed} confirmed, ${failed} not delivered, ${r.pendingCount} not closed yet, ${r.settled.length} already settled`,
        );
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Completion pull failed");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-start gap-3">
      <PushControl date={date} stops={labelsCount} unassigned={unassigned} />
      <Button variant="outline" onClick={pull} disabled={pending}>
        <CheckCircle2Icon data-icon="inline-start" /> Pull completions
      </Button>
    </div>
  );
}
