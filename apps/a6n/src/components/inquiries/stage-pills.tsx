import { runAction } from "@foundry/console/run-action";
import { cn } from "@foundry/ui/cn";
import { useRouter } from "@tanstack/react-router";
import { CheckIcon, RotateCcwIcon } from "lucide-react";
import { useState } from "react";
import { errorText } from "../../lib/error-copy";
import { changeStageFn } from "../../lib/inquiries/inquiries.fns";
import { isClosedStage, isStage, OPEN_STAGES, STAGES, type Stage } from "../../lib/inquiries/stages";
import { STAGE_LABEL } from "./labels";
import { StageDialogs, type StageDialog } from "./stage-dialogs";
import { pickStage } from "./stage-menu-items";

const PILL = "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-default";

// The detail page's status picker: every stage as a pill, one click to move. Lost asks for a reason, Won confirms,
// and a closed inquiry only offers Reopen (the stage service moves closed rows through reopen).
export function StagePills({ id, stage, canEdit }: { id: string; stage: string; canEdit: boolean }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<StageDialog>(null);
  const closed = isClosedStage(stage);
  const reached = OPEN_STAGES.indexOf(stage as (typeof OPEN_STAGES)[number]);
  const interactive = canEdit && isStage(stage) && !closed;

  function pick(to: Stage) {
    const action = pickStage(stage, to);
    if (action === "lost" || action === "won") setDialog(action);
    else if (action === "change")
      void runAction(() => changeStageFn({ data: { id, from: stage as Stage, to, lostReason: null } }), `Moved to ${STAGE_LABEL[to]}`, () => router.invalidate(), errorText);
  }

  return (
    <div role="group" aria-label="Status" className="flex flex-wrap items-center gap-2">
      {STAGES.map((s, n) => {
        const current = s === stage;
        const done = !closed && n < reached;
        return (
          <button
            key={s}
            type="button"
            aria-pressed={current}
            disabled={!interactive || current}
            onClick={() => pick(s)}
            className={cn(
              PILL,
              current
                ? "border-foreground bg-foreground font-medium text-background"
                : "border-border text-muted-foreground enabled:hover:border-foreground/40 enabled:hover:text-foreground",
              done && "text-foreground",
            )}
          >
            {done ? <CheckIcon aria-hidden className="size-3.5" /> : null}
            {STAGE_LABEL[s]}
          </button>
        );
      })}
      {closed && canEdit ? (
        <button type="button" onClick={() => setDialog("reopen")} className={cn(PILL, "border-border text-foreground hover:border-foreground/40")}>
          <RotateCcwIcon aria-hidden className="size-3.5" />
          Reopen…
        </button>
      ) : null}
      {isStage(stage) ? <StageDialogs id={id} stage={stage} dialog={dialog} close={() => setDialog(null)} /> : null}
    </div>
  );
}
