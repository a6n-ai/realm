import { Badge } from "@/components/ui/badge";

const STAGE_LABEL: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  follow_up: "Follow-up",
  converted: "Converted",
  lost: "Lost",
};

// Monochrome system: lean on Badge variants for emphasis rather than hue.
const STAGE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  new: "default",
  contacted: "secondary",
  follow_up: "secondary",
  converted: "default",
  lost: "outline",
};

export function StageBadge({ stage }: { stage: string }) {
  return (
    <Badge variant={STAGE_VARIANT[stage] ?? "secondary"} className="capitalize">
      {STAGE_LABEL[stage] ?? stage}
    </Badge>
  );
}
