import { SaladIcon, UtensilsIcon } from "lucide-react";
import { cn } from "@foundry/ui/cn";

// Was a per-plan-key random hue (see git history) — the same "random gradient" pattern
// removed from dish tiles earlier this session, for the same reason: an arbitrary color per
// key reads as noise, not signal, once there's a real brand palette. Every plan banner now
// shares the one brand-green treatment; only the icon (tiffin vs. healthy) differs, matching
// how DishImage tells dishes apart by icon rather than by hue.
export function PlanHero({
  planType,
  className,
}: {
  planType: "tiffin" | "healthy";
  className?: string;
}) {
  const Icon = planType === "healthy" ? SaladIcon : UtensilsIcon;
  return (
    <div
      aria-hidden
      className={cn("bg-primary flex h-24 items-center justify-center", className)}
    >
      <Icon className="text-primary-foreground size-9" strokeWidth={1.5} />
    </div>
  );
}
