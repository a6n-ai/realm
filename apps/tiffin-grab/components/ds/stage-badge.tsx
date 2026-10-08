import { TonePill } from "./tone-pill";

const STAGE_LABEL: Record<string, string> = {
  new: "New", contacted: "Contacted", quoted: "Quoted", follow_up: "Follow-up", converted: "Converted", lost: "Lost",
};
export type StageVariant = "neutral" | "ok" | "warn" | "bad";
const STAGE_VARIANT: Record<string, StageVariant> = {
  new: "ok", contacted: "neutral", quoted: "warn", follow_up: "warn", converted: "ok", lost: "bad",
};
export function stageVariant(stage: string): StageVariant {
  return STAGE_VARIANT[stage] ?? "neutral";
}
export function StageBadge({ stage }: { stage: string }) {
  return <TonePill tone={stageVariant(stage)}>{STAGE_LABEL[stage] ?? stage}</TonePill>;
}
