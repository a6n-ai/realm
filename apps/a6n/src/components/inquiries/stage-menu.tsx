import { ConfirmDialog } from "@foundry/console/confirm-dialog";
import { confirmAction, runAction } from "@foundry/console/run-action";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@foundry/ui/dropdown-menu";
import { useRouter } from "@tanstack/react-router";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { errorText } from "../../lib/error-copy";
import { changeStageFn } from "../../lib/inquiries/inquiries.fns";
import { isStage, type Stage } from "../../lib/inquiries/stages";
import { ResponsiveDialog } from "../responsive-dialog";
import { STAGE_LABEL } from "./labels";
import { LostForm } from "./lost-form";
import { ReopenForm } from "./reopen-form";
import { StageBadge } from "./stage-badge";
import { pickStage, stageMenuModel } from "./stage-menu-items";

type Dialog = "lost" | "won" | "reopen" | null;

// The badge is the trigger. The dialogs portal to <body>: inside a table cell, ResourceTable's row rules (`td button`: relative) would break their close button.
export function StageMenu({ id, stage, canEdit }: { id: string; stage: string; canEdit: boolean }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);
  if (!canEdit || !isStage(stage)) return <StageBadge stage={stage} />;
  const model = stageMenuModel(stage);
  const move = (to: Stage, run: typeof runAction) => run(() => changeStageFn({ data: { id, from: stage, to, lostReason: null } }), `Moved to ${STAGE_LABEL[to]}`, () => router.invalidate(), errorText);

  function pick(to: Stage) {
    const action = pickStage(stage, to);
    if (action === "lost" || action === "won") setDialog(action);
    else if (action === "change") void move(to, runAction);
  }

  const dialogs = (
    <>
      <ResponsiveDialog open={dialog === "lost"} onOpenChange={(o) => !o && setDialog(null)} title="Mark as lost" description="Why was this inquiry lost?">
        <LostForm id={id} from={stage} done={() => setDialog(null)} />
      </ResponsiveDialog>
      <ResponsiveDialog open={dialog === "reopen"} onOpenChange={(o) => !o && setDialog(null)} title="Reopen inquiry">
        <ReopenForm id={id} done={() => setDialog(null)} />
      </ResponsiveDialog>
      <ConfirmDialog
        open={dialog === "won"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Mark as won?"
        description="The inquiry closes as won. You can reopen it later."
        confirmLabel="Mark as won"
        destructive={false}
        onConfirm={async () => {
          await move("won", confirmAction);
          setDialog(null);
        }}
      />
    </>
  );

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
      {host ? createPortal(dialogs, host) : null}
    </>
  );
}
