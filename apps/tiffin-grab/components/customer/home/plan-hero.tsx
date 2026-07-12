import { SaladIcon, UtensilsIcon } from "lucide-react";
import { cn } from "@realm/ui/cn";

// Stable hue from the plan key so each plan gets a consistent, distinct banner
// with no image asset. Deterministic — same key → same gradient on server and
// client (no Math.random / Date.now).
export function hueFromKey(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 360;
  return h;
}

export function PlanHero({
  planKey,
  planType,
  className,
}: {
  planKey: string;
  planType: "tiffin" | "healthy";
  className?: string;
}) {
  const hue = hueFromKey(planKey);
  const Icon = planType === "healthy" ? SaladIcon : UtensilsIcon;
  return (
    <div
      aria-hidden
      className={cn("flex h-24 items-center justify-center", className)}
      style={{
        backgroundImage: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 40) % 360} 70% 45%))`,
      }}
    >
      <Icon className="size-9 text-white/90" strokeWidth={1.5} />
    </div>
  );
}
