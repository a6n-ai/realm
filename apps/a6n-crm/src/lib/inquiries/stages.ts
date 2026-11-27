export const STAGES = ["new", "contacted", "requirements_gathered", "proposal_sent", "negotiating", "won", "lost"] as const;
export type Stage = (typeof STAGES)[number];

export const OPEN_STAGES = ["new", "contacted", "requirements_gathered", "proposal_sent", "negotiating"] as const;
export const CLOSED_STAGES = ["won", "lost"] as const;

export const LOST_REASONS = ["budget", "timing", "chose_competitor", "no_response", "not_a_fit", "other"] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export const isStage = (s: string): s is Stage => (STAGES as readonly string[]).includes(s);
export const isOpenStage = (s: string): boolean => (OPEN_STAGES as readonly string[]).includes(s);
export const isClosedStage = (s: string): boolean => (CLOSED_STAGES as readonly string[]).includes(s);

export type StagePatch = {
  stage: Stage;
  lostReason: LostReason | null;
  closedAt?: number;
  nextFollowUpAt?: null;
};

export type StageActivity = { type: "stage_change"; fromStage: Stage; toStage: Stage };

export function transition(
  from: string,
  to: string,
  input: { lostReason?: string | null; now?: number } = {},
): { patch: StagePatch; activity: StageActivity } {
  if (!isStage(from) || !isStage(to)) throw new ValidationError(`unknown stage: ${from} -> ${to}`);
  if (isClosedStage(from)) throw new ValidationError("a closed inquiry changes only through reopen");
  if (from === to) throw new ValidationError("inquiry is already in that stage");
  const activity: StageActivity = { type: "stage_change", fromStage: from, toStage: to };
  if (to === "lost") {
    const reason = input.lostReason;
    if (!reason || !(LOST_REASONS as readonly string[]).includes(reason)) {
      throw new ValidationError("moving to lost needs a lost reason");
    }
    return { patch: { stage: to, lostReason: reason as LostReason, closedAt: input.now ?? Date.now(), nextFollowUpAt: null }, activity };
  }
  if (to === "won") {
    return { patch: { stage: to, lostReason: null, closedAt: input.now ?? Date.now(), nextFollowUpAt: null }, activity };
  }
  return { patch: { stage: to, lostReason: null }, activity };
}

export function reopen(
  from: string,
  stage: string,
  nextFollowUpAt: number | null | undefined,
): { patch: { stage: Stage; closedAt: null; nextFollowUpAt: number }; activity: { type: "reopened"; fromStage: Stage; toStage: Stage } } {
  if (!isStage(from) || !isClosedStage(from)) throw new ValidationError("only a closed inquiry can be reopened");
  if (!isStage(stage) || !isOpenStage(stage)) throw new ValidationError("reopen needs an open stage");
  if (typeof nextFollowUpAt !== "number" || !Number.isFinite(nextFollowUpAt)) {
    throw new ValidationError("reopen needs a follow-up date");
  }
  return {
    patch: { stage, closedAt: null, nextFollowUpAt },
    activity: { type: "reopened", fromStage: from, toStage: stage },
  };
}
