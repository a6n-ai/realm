import { ActivityIcon, DollarSignIcon, RefreshCwIcon, UtensilsCrossedIcon, type LucideIcon } from "lucide-react";
import { formatMoney } from "@foundry/commons";
import { ChartCard } from "@/components/analytics/chart-card";
import { Sparkline } from "@/components/analytics/sparkline";
import { Badge } from "@/components/reui/badge";
import { delta, type Delta } from "@/lib/overview/delta";
import { getOverviewSeries } from "@/lib/services/overview.service";
import { FooterLink } from "./footer-link";

type Metric = { label: string; icon: LucideIcon; value: string; delta: Delta; vs: string; spark: number[] | null };

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export async function GlanceCard({ visible, today, now }: { visible: "all" | string[]; today: string; now: number }) {
  const s = await getOverviewSeries(visible, today, now);
  const d = s.days;
  const last7 = (f: (x: (typeof d)[number]) => number) => [sum(d.slice(7).map(f)), sum(d.slice(0, 7).map(f))] as const;
  const [rev7, revPrev7] = last7((x) => x.revenue);
  const [ord7, ordPrev7] = last7((x) => x.orders);
  const metrics: Metric[] = [
    {
      label: "Tiffins today",
      icon: UtensilsCrossedIcon,
      value: String(d[13]!.tiffins),
      delta: delta(d[13]!.tiffins, d[6]!.tiffins),
      vs: "vs same day last week",
      spark: d.map((x) => x.tiffins),
    },
    {
      label: "Net revenue MTD",
      icon: DollarSignIcon,
      value: formatMoney(s.mtdRevenue),
      delta: delta(rev7, revPrev7),
      vs: "last 7 days vs the 7 before",
      spark: d.map((x) => x.revenue),
    },
    {
      label: "Active plans",
      icon: ActivityIcon,
      value: String(s.activePlans),
      delta: delta(ord7, ordPrev7),
      vs: "new orders, 7 days vs the 7 before",
      spark: d.map((x) => x.orders),
    },
    {
      label: "Renewal rate 30d",
      icon: RefreshCwIcon,
      value: s.renewal.rate == null ? "—" : `${s.renewal.rate}%`,
      delta: s.renewal.rate != null && s.renewal.prevRate != null ? delta(s.renewal.rate, s.renewal.prevRate, { points: true }) : { text: "—", tone: "flat", word: "No baseline" },
      vs: "vs the 30 days before",
      spark: null,
    },
  ];
  const attention = metrics.filter((m) => m.delta.tone === "bad").length;
  return (
    <ChartCard
      title="Today at a glance"
      subtitle="Four numbers that say how the business is doing"
      fill={false}
    >
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => (
          <div key={m.label} className="flex min-w-0 flex-col gap-2">
            <div className="text-muted-foreground flex items-center gap-1.5 text-sm font-medium">
              <m.icon className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{m.label}</span>
            </div>
            <div className="flex items-end justify-between gap-3">
              <span className="text-2xl font-medium tracking-tight tabular-nums">{m.value}</span>
              {m.spark ? <Sparkline values={m.spark} tone={m.delta.tone === "bad" ? "warning" : "c1"} /> : null}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <Badge variant={m.delta.tone === "ok" ? "success-light" : m.delta.tone === "bad" ? "warning-light" : "secondary"}>{m.delta.text}</Badge>
              <span className="text-muted-foreground">
                {m.delta.word} · {m.vs}
              </span>
            </div>
          </div>
        ))}
      </div>
      <p className="text-muted-foreground mt-5 text-sm">
        {attention === 0 ? "All four are level with or above their baseline." : `${attention} of 4 are below their baseline, worth a look.`}
      </p>
      <FooterLink href="/dashboard/analytics">Full analytics</FooterLink>
    </ChartCard>
  );
}
