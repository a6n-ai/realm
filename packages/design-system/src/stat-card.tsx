import type { LucideIcon } from "lucide-react";
import { cn } from "@realm/ui/cn";
import { Card } from "./card";

export function StatCard({
  label, value, icon: Icon, hint, delta, pixelValue,
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  hint?: string;
  delta?: { dir: "up" | "down"; text: string };
  /** Renders the value in Geist Pixel (Circle) instead of the default sans — a
   * display treatment for a handful of hero KPI numbers, not a default. */
  pixelValue?: boolean;
}) {
  return (
    <Card className="p-3 sm:p-4">
      <div className="text-muted-foreground flex items-center justify-between text-sm">
        <span>{label}</span>
        {Icon && <Icon className="hidden size-4 sm:block" />}
      </div>
      <div className={cn("nums mt-2 text-xl font-semibold sm:text-2xl", pixelValue && "font-pixel-circle")}>
        {value}
      </div>
      {hint && <div className="text-muted-foreground mt-1 text-xs">{hint}</div>}
      {delta && <div className={cn("mt-1 text-xs", delta.dir === "up" ? "text-ok" : "text-bad")}>{delta.text}</div>}
    </Card>
  );
}
