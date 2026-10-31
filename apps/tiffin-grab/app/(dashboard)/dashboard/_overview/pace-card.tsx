import { formatMoney } from "@foundry/commons";
import { ChartCard } from "@/components/analytics/chart-card";
import { TrendLineChart } from "@/components/analytics/charts";
import { getOverviewSeries } from "@/lib/services/overview.service";
import { FooterLink } from "./footer-link";

const short = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(Date.parse(`${iso}T12:00:00Z`));
const long = (iso: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(Date.parse(`${iso}T12:00:00Z`));

export async function PaceCard({ visible, today, now }: { visible: "all" | string[]; today: string; now: number }) {
  const s = await getOverviewSeries(visible, today, now);
  const avg = s.days.reduce((t, d) => t + d.revenue, 0) / s.days.length;
  const heads = [
    ["Month to date", formatMoney(s.mtdRevenue)],
    ["Today", formatMoney(s.days[13]!.revenue)],
    ["Daily average, 14 days", formatMoney(avg)],
  ];
  return (
    <ChartCard title="Revenue pace" subtitle="Net revenue per day, dashed line is the 7-day average">
      <div className="mb-4 grid grid-cols-3 gap-3">
        {heads.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <div className="text-muted-foreground truncate text-xs">{k}</div>
            <div className="text-lg font-medium tabular-nums">{v}</div>
          </div>
        ))}
      </div>
      <TrendLineChart
        data={s.days.map((d) => ({ day: short(d.date), long: long(d.date), revenue: d.revenue }))}
        xKey="day"
        yKey="revenue"
        tipKey="long"
        label="Net revenue"
        format="currency"
        height={200}
        average
        dashedAverage
      />
      <FooterLink href="/dashboard/analytics/revenue">Revenue analytics</FooterLink>
    </ChartCard>
  );
}
