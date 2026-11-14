import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { ChartCard } from "@/components/analytics/chart-card";
import { getKitchenWeek, getKitchenWeekDishes } from "@/lib/overview/overview.service";
import { KitchenWeekView } from "./kitchen-week-view";
import { addDaysIso } from "@foundry/commons/util/dates";
import { formatDateOnly } from "@/lib/format/datetime";

const md = (iso: string) => formatDateOnly(iso, { mode: "short" });

/**
 * The week at a glance for the kitchen: tiffins per meal plan, and (all-scope users) containers per
 * dish category from the label sheet. Week arrows move both tabs.
 */
export async function KitchenWeekCard({ visible, monday, thisMonday, today, seesAll }: { visible: "all" | string[]; monday: string; thisMonday: string; today: string; seesAll: boolean }) {
  const [plans, dishes] = await Promise.all([getKitchenWeek(visible, monday), seesAll ? getKitchenWeekDishes(monday) : Promise.resolve(null)]);
  const href = (m: string) => (m === thisMonday ? "/dashboard#kitchen-week" : `/dashboard?week=${m}#kitchen-week`);
  const arrows = (
    <div className="flex items-center gap-1">
      <Button asChild size="icon-sm" variant="outline">
        <Link href={href(addDaysIso(monday, -7))} aria-label="Previous week" scroll={false}>
          <ChevronLeftIcon />
        </Link>
      </Button>
      {monday !== thisMonday ? (
        <Button asChild size="sm" variant="outline">
          <Link href={href(thisMonday)} scroll={false}>This week</Link>
        </Button>
      ) : null}
      <Button asChild size="icon-sm" variant="outline">
        <Link href={href(addDaysIso(monday, 7))} aria-label="Next week" scroll={false}>
          <ChevronRightIcon />
        </Link>
      </Button>
    </div>
  );
  const dates = Array.from({ length: 7 }, (_, i) => addDaysIso(monday, i));
  // Open on today when it is in this week and has something to cook, else the first day that does.
  const cooking = dishes?.filter((d) => d.counts.length > 0).map((d) => d.date) ?? [];
  const defaultDay = cooking.includes(today) ? today : (cooking[0] ?? dates[0]!);
  return (
    <div id="kitchen-week">
      <ChartCard title="Kitchen week" subtitle={`${md(monday)} to ${md(addDaysIso(monday, 6))}, what the kitchen cooks each day`} action={arrows} fill={false}>
        <KitchenWeekView plans={plans} dishes={dishes} dates={dates} defaultDay={defaultDay} />
      </ChartCard>
    </div>
  );
}
