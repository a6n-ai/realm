import type { BoardColumn } from "../../lib/inquiries/repository";
import { isClosedStage, type Stage } from "../../lib/inquiries/stages";
import { pickStage } from "./stage-menu-items";

export type DropAction = "noop" | "change" | "lost" | "won" | "reopen";

// A closed card only leaves through Reopen, wherever it lands; an open card follows the status dropdown.
export function dropAction(from: string, to: Stage): DropAction {
  if (from === to) return "noop";
  return isClosedStage(from) ? "reopen" : pickStage(from, to);
}

// Optimistic move: the card jumps to the top of its new column and both counts follow.
export function moveCard(columns: BoardColumn[], id: string, to: Stage): BoardColumn[] {
  const card = columns.flatMap((c) => c.cards).find((c) => c.id === id);
  if (!card || card.stage === to) return columns;
  return columns.map((c) => {
    if (c.stage === card.stage) return { ...c, count: c.count - 1, cards: c.cards.filter((x) => x.id !== id) };
    if (c.stage === to) return { ...c, count: c.count + 1, cards: [{ ...card, stage: to }, ...c.cards] };
    return c;
  });
}
