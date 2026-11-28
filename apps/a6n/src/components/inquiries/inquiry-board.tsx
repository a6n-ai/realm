import { ConsoleLink } from "@foundry/console/router";
import { toast } from "@foundry/ui/toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@foundry/ui/tooltip";
import { useRouter } from "@tanstack/react-router";
import { InboxIcon } from "lucide-react";
import { useEffect, useState, type DragEvent } from "react";
import { errorText } from "../../lib/error-copy";
import { changeStageFn } from "../../lib/inquiries/inquiries.fns";
import { BOARD_CLOSED_DAYS, type BoardColumn } from "../../lib/inquiries/repository";
import { isClosedStage, type Stage } from "../../lib/inquiries/stages";
import { dropAction, moveCard } from "./board-model";
import { inquiryLabel } from "./columns";
import { FollowUpBadge } from "./follow-up-badge";
import { STAGE_LABEL } from "./labels";
import { OwnerAvatar } from "./owner-avatar";
import { StageDialogs, type StageDialog } from "./stage-dialogs";
import { StageMenu } from "./stage-menu";

type Card = BoardColumn["cards"][number];

function BoardCard({ card, canEdit, onDragStart }: { card: Card; canEdit: boolean; onDragStart: (e: DragEvent, id: string) => void }) {
  const closed = isClosedStage(card.stage);
  return (
    <li
      draggable={canEdit}
      onDragStart={(e) => onDragStart(e, card.id)}
      className={`grid gap-2 rounded-lg border bg-background p-3 text-sm ${canEdit ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="grid min-w-0">
          <ConsoleLink to={`/inquiries/${card.id}`} draggable={false} className="truncate font-medium text-(--strong) outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
            {inquiryLabel(card)}
          </ConsoleLink>
          {card.contactName && card.companyName ? <span className="truncate text-xs text-muted-foreground">{card.companyName}</span> : null}
        </div>
        <OwnerAvatar name={card.ownerName} />
      </div>
      {closed ? null : (
        <div className="text-xs">
          <FollowUpBadge at={card.nextFollowUpAt} overdue={card.overdue} />
        </div>
      )}
      <div className="flex items-center justify-between gap-2 text-xs">
        <StageMenu id={card.id} stage={card.stage} canEdit={canEdit} />
        <span className="truncate text-muted-foreground" title={card.source}>
          {card.source}
        </span>
      </div>
    </li>
  );
}

export function InquiryBoard({ columns, canEdit, viewAll }: { columns: BoardColumn[]; canEdit: boolean; viewAll: (stage: Stage) => Record<string, unknown> }) {
  const router = useRouter();
  const [cols, setCols] = useState(columns);
  useEffect(() => setCols(columns), [columns]);
  const [over, setOver] = useState<Stage | null>(null);
  const [pending, setPending] = useState<{ id: string; stage: Stage; dialog: StageDialog }>({ id: "", stage: "new", dialog: null });

  const onDragStart = (e: DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  };

  async function drop(e: DragEvent, to: Stage) {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData("text/plain");
    const card = cols.flatMap((c) => c.cards).find((c) => c.id === id);
    if (!card || !canEdit) return;
    const action = dropAction(card.stage, to);
    if (action === "noop") return;
    if (action !== "change") return setPending({ id, stage: card.stage as Stage, dialog: action });
    const before = cols;
    setCols(moveCard(cols, id, to));
    try {
      const res = await changeStageFn({ data: { id, from: card.stage as Stage, to, lostReason: null } });
      if (typeof res === "object" && res !== null && "ok" in res && res.ok === false) throw new Error("code" in res ? String(res.code) : "");
      toast.success(`Moved to ${STAGE_LABEL[to]}`);
      await router.invalidate();
    } catch (err) {
      setCols(before);
      toast.error(errorText(err));
    }
  }

  return (
    <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 md:snap-none">
      {cols.map((col) => {
        const closed = isClosedStage(col.stage);
        const header = (
          <h2 className="flex h-8 items-center justify-between gap-2 px-1 text-sm font-semibold">
            {STAGE_LABEL[col.stage]}
            <span className="text-xs font-normal tabular-nums text-muted-foreground">{col.count}</span>
          </h2>
        );
        return (
          <section
            key={col.stage}
            aria-label={`${STAGE_LABEL[col.stage]}, ${col.count}`}
            onDragOver={(e) => {
              if (!canEdit) return;
              e.preventDefault();
              setOver(col.stage);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null);
            }}
            onDrop={(e) => void drop(e, col.stage)}
            className={`grid w-72 shrink-0 snap-start content-start gap-2 rounded-xl border bg-muted/40 p-2 ${over === col.stage ? "ring-2 ring-ring" : ""}`}
          >
            {closed ? (
              <Tooltip>
                <TooltipTrigger render={<div />}>{header}</TooltipTrigger>
                <TooltipContent>Closed in the last {BOARD_CLOSED_DAYS} days</TooltipContent>
              </Tooltip>
            ) : (
              header
            )}
            {col.cards.length === 0 ? (
              <p className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                <InboxIcon aria-hidden className="size-3.5" />
                Nothing here
              </p>
            ) : (
              <ul className="grid max-h-[calc(100dvh-18rem)] gap-2 overflow-y-auto">
                {col.cards.map((card) => (
                  <BoardCard key={card.id} card={card} canEdit={canEdit} onDragStart={onDragStart} />
                ))}
              </ul>
            )}
            {col.count > col.cards.length ? (
              <ConsoleLink to="/inquiries" search={viewAll(col.stage)} className="px-1 text-xs text-(--link) underline-offset-4 hover:underline">
                View all {col.count}
              </ConsoleLink>
            ) : null}
          </section>
        );
      })}
      <StageDialogs id={pending.id} stage={pending.stage} dialog={pending.dialog} close={() => setPending((p) => ({ ...p, dialog: null }))} />
    </div>
  );
}
