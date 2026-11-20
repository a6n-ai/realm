import type { Visible } from "@/lib/tenant/org-scope";
import { ActivityIcon, PackageIcon, RefreshCwIcon, UtensilsCrossedIcon } from "lucide-react";
import { StatCards, type StatCardItem } from "@/components/dashboard/stat-cards";
import { zonedRangeMs } from "@/lib/dates/epoch-window";
import { dateQs, rangeParams } from "@/lib/dates/range-params";
import { ordersListHref } from "@/lib/list/orders-drill";
import { getOverviewSeries } from "@/lib/overview/overview.service";

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/** The four headline figures in one divided card. No revenue on the Overview; it lives in Analytics. */
export async function GlanceCard({ visible, today, now, timeZone }: { visible: Visible; today: string; now: number; timeZone: string }) {
  const s = await getOverviewSeries(visible, today, now);
  const d = s.days;
  const last7 = (f: (x: (typeof d)[number]) => number) => [sum(d.slice(7).map(f)), sum(d.slice(0, 7).map(f))] as const;
  const [ord7, ordPrev7] = last7((x) => x.orders);
  const week = zonedRangeMs(d[7]!.date, d[13]!.date, timeZone);
  const rate = s.renewal.rate;
  const items: StatCardItem[] = [
    {
      label: "Tiffins today",
      icon: UtensilsCrossedIcon,
      value: d[13]!.tiffins,
      hint: "Scheduled for delivery today",
      delta: { now: d[13]!.tiffins, before: d[6]!.tiffins, good: "up" },
      compareLabel: "same day last week",
    },
    {
      label: "Orders this week",
      icon: PackageIcon,
      value: ord7,
      hint: "Placed in the last 7 days",
      delta: { now: ord7, before: ordPrev7, good: "up" },
      compareLabel: "previous 7 days",
      href: ordersListHref({ dateQs: dateQs(rangeParams(week, timeZone, now, { exact: true })) }),
    },
    {
      label: "Active plans",
      icon: ActivityIcon,
      value: s.activePlans,
      hint: "Plans running now",
      href: ordersListHref({}, { status: "active", clearDates: true, datesAll: true }),
    },
    {
      label: "Renewal rate 30d",
      icon: RefreshCwIcon,
      value: rate == null ? "—" : `${rate}%`,
      hint: "Ended plans that renewed, last 30 days",
      delta: rate != null && s.renewal.prevRate != null ? { now: rate, before: s.renewal.prevRate, good: "up" } : undefined,
      compareLabel: "the 30 days before",
      href: "/dashboard/renewals",
    },
  ];
  return <StatCards items={items} cols={4} />;
}
