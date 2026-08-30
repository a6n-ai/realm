import type { LucideIcon } from "lucide-react";
import { cn } from "@realm/ui/cn";
import { Card } from "./card";

export function StatCard({
  label, value, icon: Icon, hint, delta, tone, pixelValue = true,
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  hint?: string;
  delta?: { dir: "up" | "down"; text: string };
  /** Colors the value itself (not a delta line) — for a bare "this count is
   * bad" tile with no up/down comparison, e.g. failed sends, suppressions. */
  tone?: "ok" | "bad";
  /** Geist Pixel (Circle) is every StatCard's default value treatment; set
   * false only to fall back to the plain sans (rare — matching a one-off
   * tile that isn't a KPI hero number). */
  pixelValue?: boolean;
}) {
  return (
    <Card className="flex h-full flex-col p-3 sm:p-4">
      <div className="text-muted-foreground flex items-center justify-between text-sm">
        <span>{label}</span>
        {Icon && <Icon className="hidden size-4 sm:block" />}
      </div>
      <div
        className={cn(
          "nums mt-2 text-xl font-semibold sm:text-2xl",
          pixelValue && "font-pixel-circle",
          tone === "ok" && "text-ok",
          tone === "bad" && "text-bad",
        )}
      >
        {value}
      </div>
      {hint && <div className="text-muted-foreground mt-1 text-xs">{hint}</div>}
      {delta && <div className={cn("mt-1 text-xs", delta.dir === "up" ? "text-ok" : "text-bad")}>{delta.text}</div>}
    </Card>
  );
}
