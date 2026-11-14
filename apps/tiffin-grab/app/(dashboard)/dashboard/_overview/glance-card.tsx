import Link from "next/link";
import { ActivityIcon, PackageIcon, RefreshCwIcon, UtensilsCrossedIcon, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@foundry/ui/card";
import { Sparkline } from "@/components/analytics/sparkline";
import { Badge } from "@/components/reui/badge";
import { zonedRangeMs } from "@/lib/dates/epoch-window";
import { ordersListHref } from "@/lib/list/orders-drill";
import { delta, type Delta } from "@/lib/overview/delta";
import { getOverviewSeries } from "@/lib/overview/overview.service";

type Metric = { label: string; icon: LucideIcon; value: string; delta: Delta; vs: string; spark: number[] | null; href?: string };

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/** The four headline tiles, each its own card. No revenue on the Overview; it lives in Analytics. */
export async function GlanceCard({ visible, today, now, timeZone }: { visible: "all" | string[]; today: string; now: number; timeZone: string }) {
  const s = await getOverviewSeries(visible, today, now);
  const d = s.days;
  const last7 = (f: (x: (typeof d)[number]) => number) => [sum(d.slice(7).map(f)), sum(d.slice(0, 7).map(f))] as const;
  const [ord7, ordPrev7] = last7((x) => x.orders);
  const week = zonedRangeMs(d[7]!.date, d[13]!.date, timeZone);
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
      label: "Orders this week",
      icon: PackageIcon,
      value: String(ord7),
      delta: delta(ord7, ordPrev7),
      vs: "last 7 days vs the 7 before",
      spark: d.map((x) => x.orders),
      href: ordersListHref({ from: String(week.from), to: String(week.to) }),
    },
    {
      label: "Active plans",
      icon: ActivityIcon,
      value: String(s.activePlans),
      delta: delta(ord7, ordPrev7),
      vs: "new orders, 7 days vs the 7 before",
      spark: null,
      href: ordersListHref({}, { status: "active", clearDates: true, datesAll: true }),
    },
    {
      label: "Renewal rate 30d",
      icon: RefreshCwIcon,
      value: s.renewal.rate == null ? "—" : `${s.renewal.rate}%`,
      delta: s.renewal.rate != null && s.renewal.prevRate != null ? delta(s.renewal.rate, s.renewal.prevRate, { points: true }) : { text: "—", tone: "flat", word: "No baseline" },
      vs: "vs the 30 days before",
      spark: null,
      href: "/dashboard/renewals",
    },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((m) => {
        const card = (
        <Card key={m.label} className={m.href ? "h-full transition-[border-color,box-shadow] group-hover/stat:border-foreground/20 group-hover/stat:shadow-md" : undefined}>
          <CardContent className="flex min-w-0 flex-col gap-2">
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
          </CardContent>
        </Card>
        );
        return m.href ? (
          <Link key={m.label} href={m.href} className="group/stat focus-visible:ring-ring rounded-xl outline-none focus-visible:ring-2">
            {card}
          </Link>
        ) : (
          card
        );
      })}
    </div>
  );
}
