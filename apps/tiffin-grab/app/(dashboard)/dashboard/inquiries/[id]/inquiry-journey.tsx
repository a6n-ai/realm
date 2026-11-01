"use client";

import { CheckIcon, XIcon } from "lucide-react";
import { cn } from "@foundry/ui/cn";
import { groupFor, isClosed, type SubStatus } from "@/lib/inquiries/status";

const STEPS = ["Lead", "Follow-up", "Took"] as const;

// Closed-without-order replaces the last step with a red "Lost"/"Undeliverable" node.
function stepState(sub: SubStatus | null) {
  const took = sub === "took_plan" || sub === "took_trial";
  const dropped = isClosed(sub) && !took;
  const current = took ? 2 : groupFor(sub) === "follow_up" ? 1 : 0;
  return { took, dropped, current };
}

export function InquiryJourney({ subStatus, droppedLabel }: { subStatus: SubStatus | null; droppedLabel: string }) {
  const { took, dropped, current } = stepState(subStatus);

  return (
    <div className="bg-card rounded-xl border px-4 py-3">
      <ol className="flex items-center">
        {STEPS.map((label, i) => {
          const isLast = i === STEPS.length - 1;
          const lostNode = dropped && isLast;
          const state = lostNode ? "lost" : dropped ? (i < current ? "done" : "muted") : took || current > i ? "done" : current === i ? "current" : "muted";
          const connectorFilled = !dropped && current >= i;
          return (
            <li key={label} className={cn("flex items-center", !isLast && "flex-1")}>
              {i > 0 ? (
                <span aria-hidden className={cn("mx-2 h-px flex-1 transition-colors", connectorFilled ? "bg-primary" : "bg-border")} />
              ) : null}
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                    state === "done" && "border-primary bg-primary text-primary-foreground",
                    state === "current" && "border-primary text-primary ring-primary/15 ring-4",
                    state === "muted" && "border-border text-muted-foreground",
                    state === "lost" && "border-bad bg-bad/15 text-bad",
                  )}
                >
                  {state === "done" ? <CheckIcon className="size-3.5" /> : lostNode ? <XIcon className="size-3.5" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "text-sm whitespace-nowrap transition-colors",
                    state === "current" && "text-foreground font-semibold",
                    state === "done" && "text-foreground",
                    state === "muted" && "text-muted-foreground",
                    state === "lost" && "text-bad font-semibold",
                  )}
                >
                  {lostNode ? droppedLabel : label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
