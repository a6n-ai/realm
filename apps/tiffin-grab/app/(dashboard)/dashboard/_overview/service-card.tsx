import { ChartCard } from "@/components/analytics/chart-card";
import type { Part } from "@/components/analytics/chart-math";
import { SegmentedBar } from "@/components/analytics/charts";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { dailyLabelSheet, listDayDeliveryStatuses } from "@/lib/services/daily-labels.service";
import { deliveryGroup } from "./delivery-groups";
import { FooterLink } from "./footer-link";
import { Badge } from "@/components/reui/badge";
import Link from "next/link";

const hourLabel = (h: number) => `${h % 12 || 12}:00 ${h < 12 ? "AM" : "PM"}`;

export async function ServiceCard({ today }: { today: string }) {
  const [rows, sheet, settings] = await Promise.all([listDayDeliveryStatuses(today), dailyLabelSheet(today), getAppSettings()]);
  const scheduled = rows.filter((r) => deliveryGroup(r) === "scheduled");
  const delivered = scheduled.filter((r) => r.status === "Delivered").length;
  const count = (g: string) => rows.filter((r) => deliveryGroup(r) === g).length;
  const kitchen = new Map<string, number>();
  for (const l of sheet.labels) kitchen.set(l.mealSizeName, (kitchen.get(l.mealSizeName) ?? 0) + 1);

  return (
    <ChartCard title="Today's service" subtitle={`Order cutoff ${hourLabel(settings.cutoffHour)} the evening before`}>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">No deliveries today.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-medium tracking-tight tabular-nums">
              {delivered}/{scheduled.length}
            </span>
            <span className="text-muted-foreground text-sm">delivered of scheduled</span>
          </div>
          <SegmentedBar
            withList
            parts={([
              { label: "Delivered", value: delivered, tone: "success" },
              { label: "On the way", value: scheduled.length - delivered, tone: "c2" },
              { label: "On hold", value: count("skipped"), tone: "warning" },
              { label: "Paused", value: count("paused"), tone: "c4" },
              { label: "Cancelled", value: count("cancelled"), tone: "destructive" },
            ] satisfies Part[]).filter((p) => p.value > 0)}
          />
          <div className="flex flex-wrap gap-1.5">
            {kitchen.size === 0 ? (
              <span className="text-muted-foreground text-xs">Kitchen counts need a released menu for today.</span>
            ) : (
              [...kitchen].sort((a, b) => b[1] - a[1]).map(([name, n]) => (
                <Badge key={name} variant="secondary">
                  {name} {n}
                </Badge>
              ))
            )}
          </div>
          <Link href="/dashboard/labels" className="text-muted-foreground hover:text-foreground w-fit text-sm underline underline-offset-2">
            Open Labels
          </Link>
        </div>
      )}
      <FooterLink href="/dashboard/dispatch">Open Dispatch</FooterLink>
    </ChartCard>
  );
}
