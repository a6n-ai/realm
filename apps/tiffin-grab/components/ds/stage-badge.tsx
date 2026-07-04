import { cn } from "@/lib/utils";

const STAGE_LABEL: Record<string, string> = {
  new: "New", contacted: "Contacted", follow_up: "Follow-up", converted: "Converted", lost: "Lost",
};
export type StageVariant = "neutral" | "ok" | "warn" | "bad";
const STAGE_VARIANT: Record<string, StageVariant> = {
  new: "ok", contacted: "neutral", follow_up: "warn", converted: "ok", lost: "bad",
};
export function stageVariant(stage: string): StageVariant {
  return STAGE_VARIANT[stage] ?? "neutral";
}
const VARIANT_CLASS: Record<StageVariant, string> = {
  neutral: "bg-muted text-muted-foreground border",
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  bad: "bg-bad/15 text-bad",
};

export function StageBadge({ stage }: { stage: string }) {
  const v = stageVariant(stage);
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", VARIANT_CLASS[v])}>
      {STAGE_LABEL[stage] ?? stage}
    </span>
  );
}
