import { Badge } from "@foundry/ui/badge";
import { stageLabel } from "./labels";

const TONE: Record<string, "neutral" | "info" | "warning" | "success" | "danger"> = {
  new: "neutral",
  contacted: "info",
  requirements_gathered: "info",
  proposal_sent: "info",
  negotiating: "warning",
  won: "success",
  lost: "danger",
};

export function StageBadge({ stage }: { stage: string }) {
  return <Badge variant={TONE[stage] ?? "neutral"}>{stageLabel(stage)}</Badge>;
}
