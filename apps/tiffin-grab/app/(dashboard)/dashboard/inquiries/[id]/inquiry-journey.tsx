"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { CheckIcon, XIcon } from "lucide-react";
import { Button } from "@realm/ui/button";
import { cn } from "@realm/ui/cn";
import { setStage } from "../actions";
import { nextAction, type NextActionKind } from "../_leads/next-action";
import { MarkLostDialog } from "./inquiry-controls";
import type { InquiryStage } from "@/lib/services/inquiries.service";

// The linear pipeline the stepper renders. "lost" is terminal and off-rail —
// it replaces "Won" with a red node rather than occupying its own step.
const STEPS: { key: InquiryStage; label: string }[] = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "quoted", label: "Quoted" },
  { key: "follow_up", label: "Follow-up" },
  { key: "converted", label: "Won" },
];

export function InquiryJourney({
  inquiryId,
  stage,
  convertedOrderHref,
  onNudge,
}: {
  inquiryId: string;
  stage: InquiryStage;
  convertedOrderHref?: string;
  onNudge: (a: NextActionKind) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const lost = stage === "lost";
  const terminal = lost || stage === "converted";
  const currentIndex = STEPS.findIndex((s) => s.key === stage);
  const next = nextAction(stage);

  function fire() {
    if (!next) return;
    const action = next.action;
    // A stage nudge is self-contained here — optimistic move with a toast-Undo,
    // mirroring StageControl. Everything else (activity/convert) needs parent state.
    if (action?.kind === "stage") {
      const to = action.to;
      start(async () => {
        const { previous } = await setStage(inquiryId, to);
        router.refresh();
        if (previous !== to) {
          toast(`Stage → ${to}`, {
            action: {
              label: "Undo",
              onClick: () => start(async () => { await setStage(inquiryId, previous); router.refresh(); }),
            },
          });
        }
      });
      return;
    }
    if (action?.kind === "view_order") {
      if (convertedOrderHref) router.push(convertedOrderHref);
      else onNudge(action);
      return;
    }
    onNudge(action);
  }

  return (
    <div className="bg-card rounded-xl border p-4 sm:p-5">
      {/* Desktop rail */}
      <ol className="hidden items-center sm:flex">
        {STEPS.map((step, i) => {
          const isLast = i === STEPS.length - 1;
          const lostNode = lost && isLast;
          const state = lostNode
            ? "lost"
            : lost
              ? "muted"
              : currentIndex > i
                ? "done"
                : currentIndex === i
                  ? "current"
                  : "muted";
          const connectorFilled = !lost && currentIndex >= i;
          return (
            <li key={step.key} className={cn("flex items-center", !isLast && "flex-1")}>
              {i > 0 ? (
                <span
                  aria-hidden
                  className={cn(
                    "mx-2 h-px flex-1 transition-colors",
                    connectorFilled ? "bg-primary" : "bg-border",
                  )}
                />
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
                  {state === "done" ? (
                    <CheckIcon className="size-3.5" />
                  ) : lostNode ? (
                    <XIcon className="size-3.5" />
                  ) : (
                    i + 1
                  )}
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
                  {lostNode ? "Lost" : step.label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Mobile collapsed indicator */}
      <div className="flex items-center gap-3 sm:hidden">
        <div className="flex gap-1">
          {STEPS.map((step, i) => (
            <span
              key={step.key}
              className={cn(
                "size-1.5 rounded-full transition-colors",
                lost
                  ? "bg-muted"
                  : currentIndex >= i
                    ? "bg-primary"
                    : "bg-muted",
              )}
            />
          ))}
        </div>
        <span className="text-sm font-medium">
          {lost ? (
            <span className="text-bad">Lost</span>
          ) : (
            <>
              {STEPS[currentIndex]?.label ?? STEPS[0].label}
              <span className="text-muted-foreground font-normal">
                {" "}· Step {currentIndex + 1} of {STEPS.length}
              </span>
            </>
          )}
        </span>
      </div>

      {/* Next-best-action nudge — sticky bottom bar on mobile, inline on desktop */}
      {next ? (
        <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-0 z-10 -mx-4 -mb-4 mt-4 flex flex-col gap-2 border-t px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:mb-0 sm:mt-4 sm:flex-row sm:items-center sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none">
          <Button onClick={fire} disabled={pending} className="w-full sm:w-auto">
            {next.label}
          </Button>
          {!terminal ? (
            <div className="[&_button]:w-full sm:[&_button]:w-auto">
              <MarkLostDialog inquiryId={inquiryId} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
