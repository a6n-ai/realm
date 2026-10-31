import { ChartCard } from "@/components/analytics/chart-card";
import { PartsDonut } from "@/components/analytics/charts";
import { slotTone } from "@/components/analytics/chart-math";
import { addDays } from "@/lib/deliveries-view/week";
import { dailyLabelSheet } from "@/lib/services/daily-labels.service";
import { listMealSizeNames } from "@/lib/services/overview.service";
import { nextRoutePushStatus } from "@/lib/services/optimoroute/push-status";
import { FooterLink } from "./footer-link";

export async function CookingCard({ today }: { today: string }) {
  // The next delivery day, not the calendar's tomorrow: on a Saturday the kitchen plans Monday.
  const next = await nextRoutePushStatus(today).catch(() => null);
  const day = next?.date ?? addDays(today, 1);
  const label = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(Date.parse(`${day}T12:00:00Z`));
  const [sheet, order] = await Promise.all([dailyLabelSheet(day), listMealSizeNames()]);
  const by = new Map<string, number>();
  for (const l of sheet.labels) by.set(l.mealSizeName, (by.get(l.mealSizeName) ?? 0) + 1);
  return (
    <ChartCard title="What's cooking next" subtitle={`${label}, tiffins to pack by meal size`}>
      {by.size === 0 ? (
        <p className="text-muted-foreground text-sm">
          {sheet.menuWeekPublicId ? `Nothing to pack for ${label}.` : `No menu is released for the week of ${label} yet.`}
        </p>
      ) : (
        <PartsDonut caption="Tiffins" max={5} parts={[...by].map(([label, value]) => ({ label, value, tone: slotTone(label, order) }))} />
      )}
      <FooterLink href={`/dashboard/labels?date=${day}`}>Open Labels</FooterLink>
    </ChartCard>
  );
}
