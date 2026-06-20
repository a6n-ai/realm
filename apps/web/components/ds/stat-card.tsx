import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "./card";

export function StatCard({
  label, value, icon: Icon, delta,
}: {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  delta?: { dir: "up" | "down"; text: string };
}) {
  return (
    <Card className="p-4">
      <div className="text-muted-foreground flex items-center justify-between text-sm">
        <span>{label}</span>
        {Icon && <Icon className="size-4" />}
      </div>
      <div className="gradient-text mt-2 text-2xl font-semibold">{value}</div>
      {delta && <div className={cn("mt-1 text-xs", delta.dir === "up" ? "text-ok" : "text-bad")}>{delta.text}</div>}
    </Card>
  );
}
