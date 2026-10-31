import { ChartCard } from "@/components/analytics/chart-card";
import { PartsDonut } from "@/components/analytics/charts";
import { slotTone } from "@/components/analytics/chart-math";
import { addDays } from "@/lib/deliveries-view/week";
import { dailyLabelSheet } from "@/lib/services/daily-labels.service";
import { listMealSizeNames } from "@/lib/services/overview.service";
import { FooterLink } from "./footer-link";

export async function CookingCard({ today }: { today: string }) {
  const tomorrow = addDays(today, 1);
  const [sheet, order] = await Promise.all([dailyLabelSheet(tomorrow), listMealSizeNames()]);
  const by = new Map<string, number>();
  for (const l of sheet.labels) by.set(l.mealSizeName, (by.get(l.mealSizeName) ?? 0) + 1);
  return (
    <ChartCard title="What's cooking tomorrow" subtitle="Tiffins to pack by meal size">
      {by.size === 0 ? (
        <p className="text-muted-foreground text-sm">
          {sheet.menuWeekPublicId ? "Nothing to pack tomorrow." : "No menu is released for tomorrow's week yet."}
        </p>
      ) : (
        <PartsDonut caption="Tiffins" max={5} parts={[...by].map(([label, value]) => ({ label, value, tone: slotTone(label, order) }))} />
      )}
      <FooterLink href={`/dashboard/labels?date=${tomorrow}`}>Open Labels</FooterLink>
    </ChartCard>
  );
}
