"use client";

import { useRouter } from "next/navigation";
import { CheckIcon, XIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { cn } from "@foundry/ui/cn";
import { useTimezone } from "@/components/providers/timezone-provider";
import { groupFor, isClosed, type SubStatus } from "@/lib/inquiries/status";
import { nextAction, type NextActionKind } from "../_leads/next-action";
import { StatusPopup } from "../_leads/status-popup";

const STEPS = ["Lead", "Follow-up", "Took"] as const;

// Closed-without-order replaces the last step with a red "Lost"/"Undeliverable" node.
function stepState(sub: SubStatus | null) {
  const took = sub === "took_plan" || sub === "took_trial";
  const dropped = isClosed(sub) && !took;
  const current = took ? 2 : groupFor(sub) === "follow_up" ? 1 : 0;
  return { took, dropped, current };
}

export function InquiryJourney({
  inquiryId,
  subStatus,
  convertedOrderHref,
  onNudge,
  onConvert,
  droppedLabel,
}: {
  inquiryId: string;
  subStatus: SubStatus | null;
  convertedOrderHref?: string;
  onNudge: (a: NextActionKind) => void;
  onConvert: () => void;
  droppedLabel: string;
}) {
  const router = useRouter();
  const tz = useTimezone();
  const { took, dropped, current } = stepState(subStatus);
  const rawNext = nextAction(subStatus);
  const next = rawNext?.action?.kind === "view_order" && !convertedOrderHref ? null : rawNext;

  function fire() {
    const action = next?.action;
    if (action?.kind === "view_order" && convertedOrderHref) router.push(convertedOrderHref);
    else onNudge(action ?? null);
  }

  const nudge = next ? (
    next.action?.kind === "status" ? (
      <StatusPopup
        inquiryId={inquiryId}
        subStatus={subStatus}
        timeZone={tz}
        onConvert={onConvert}
        trigger={<Button className="w-full sm:w-auto">{next.label}</Button>}
      />
    ) : (
      <Button onClick={fire} className="w-full sm:w-auto">{next.label}</Button>
    )
  ) : null;

  return (
    <div className="bg-card rounded-xl border p-4 sm:p-5">
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

      {nudge ? (
        <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-0 z-10 -mx-4 -mb-4 mt-4 flex flex-col gap-2 border-t px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:mb-0 sm:mt-4 sm:flex-row sm:items-center sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
          {nudge}
        </div>
      ) : null}
    </div>
  );
}
