import { TonePill } from "./tone-pill";

const STAGE_LABEL: Record<string, string> = {
  new: "Lead", contacted: "Responded", quoted: "Follow-up", follow_up: "Follow-up", converted: "Took plan/trial", lost: "Lost",
};
export function stageLabel(stage: string): string {
  return STAGE_LABEL[stage] ?? stage;
}
export type StageVariant = "neutral" | "ok" | "warn" | "bad";
const STAGE_VARIANT: Record<string, StageVariant> = {
  new: "ok", contacted: "neutral", quoted: "warn", follow_up: "warn", converted: "ok", lost: "bad",
};
export function stageVariant(stage: string): StageVariant {
  return STAGE_VARIANT[stage] ?? "neutral";
}
export function StageBadge({ stage }: { stage: string }) {
  return <TonePill tone={stageVariant(stage)}>{stageLabel(stage)}</TonePill>;
}
