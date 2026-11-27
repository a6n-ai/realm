import { isClosedStage, STAGES, type Stage } from "../../lib/inquiries/stages";

export type StagePick = "noop" | "change" | "lost" | "won";

// A closed inquiry only offers Reopen: the stage service moves closed rows through reopen, not changeStage.
export function stageMenuModel(stage: string): { stages: readonly Stage[]; reopen: boolean } {
  return isClosedStage(stage) ? { stages: [], reopen: true } : { stages: STAGES, reopen: false };
}

export function pickStage(current: string, to: Stage): StagePick {
  if (to === current) return "noop";
  return to === "lost" || to === "won" ? to : "change";
}
