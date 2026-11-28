import { runAction } from "@foundry/console/run-action";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@foundry/ui/dropdown-menu";
import { useRouter } from "@tanstack/react-router";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { errorText } from "../../lib/error-copy";
import { changeStageFn } from "../../lib/inquiries/inquiries.fns";
import { isStage, type Stage } from "../../lib/inquiries/stages";
import { STAGE_LABEL } from "./labels";
import { StageDialogs, type StageDialog } from "./stage-dialogs";
import { StageBadge } from "./stage-badge";
import { pickStage, stageMenuModel } from "./stage-menu-items";

// The badge is the trigger.
export function StageMenu({ id, stage, canEdit }: { id: string; stage: string; canEdit: boolean }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<StageDialog>(null);
  if (!canEdit || !isStage(stage)) return <StageBadge stage={stage} />;
  const model = stageMenuModel(stage);
  const move = (to: Stage) => runAction(() => changeStageFn({ data: { id, from: stage, to, lostReason: null } }), `Moved to ${STAGE_LABEL[to]}`, () => router.invalidate(), errorText);

  function pick(to: Stage) {
    const action = pickStage(stage, to);
    if (action === "lost" || action === "won") setDialog(action);
    else if (action === "change") void move(to);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Change status"
          render={<button type="button" className="inline-flex items-center gap-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />}
        >
          <StageBadge stage={stage} />
          <ChevronDownIcon aria-hidden className="size-3.5 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-52">
          {model.stages.map((s) => (
            <DropdownMenuItem key={s} onClick={() => pick(s)}>
              <CheckIcon aria-hidden className={s === stage ? "" : "invisible"} />
              {STAGE_LABEL[s]}
            </DropdownMenuItem>
          ))}
          {model.reopen ? (
            <DropdownMenuItem onClick={() => setDialog("reopen")}>Reopen…</DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <StageDialogs id={id} stage={stage} dialog={dialog} close={() => setDialog(null)} />
    </>
  );
}
