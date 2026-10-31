import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@foundry/ui/table";
import { ChartCard } from "@/components/analytics/chart-card";
import { MiniBars } from "@/components/analytics/mini-bars";
import { Badge } from "@/components/reui/badge";
import { delta } from "@/lib/overview/delta";
import { addDays } from "@/lib/deliveries-view/week";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import type { KitchenWeekRow } from "@/lib/overview/kitchen-week";
import { getKitchenWeek, getKitchenWeekDishes } from "@/lib/services/overview.service";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const md = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(Date.parse(`${iso}T12:00:00Z`));

/**
 * The week at a glance for the kitchen: tiffins per meal plan, and (all-scope users) containers per
 * dish category from the label sheet. Week arrows move both tabs.
 */
export async function KitchenWeekCard({ visible, monday, thisMonday, seesAll }: { visible: "all" | string[]; monday: string; thisMonday: string; seesAll: boolean }) {
  const [plans, dishes] = await Promise.all([getKitchenWeek(visible, monday), seesAll ? getKitchenWeekDishes(monday) : Promise.resolve(null)]);
  const href = (m: string) => (m === thisMonday ? "/dashboard#kitchen-week" : `/dashboard?week=${m}#kitchen-week`);
  const arrows = (
    <div className="flex items-center gap-1">
      <Button asChild size="icon-sm" variant="outline">
        <Link href={href(addDays(monday, -7))} aria-label="Previous week" scroll={false}>
          <ChevronLeftIcon />
        </Link>
      </Button>
      {monday !== thisMonday ? (
        <Button asChild size="sm" variant="outline">
          <Link href={href(thisMonday)} scroll={false}>This week</Link>
        </Button>
      ) : null}
      <Button asChild size="icon-sm" variant="outline">
        <Link href={href(addDays(monday, 7))} aria-label="Next week" scroll={false}>
          <ChevronRightIcon />
        </Link>
      </Button>
    </div>
  );
  return (
    <div id="kitchen-week">
      <ChartCard title="Kitchen week" subtitle={`${md(monday)} to ${md(addDays(monday, 6))}, what the kitchen cooks each day`} action={arrows} fill={false}>
        <Tabs defaultValue="plans" className="gap-4">
          <TabsList>
            <TabsTrigger value="plans">By plan</TabsTrigger>
            {dishes ? <TabsTrigger value="dishes">By dish</TabsTrigger> : null}
          </TabsList>
          <TabsContent value="plans">
            <WeekTable rows={plans} monday={monday} rowHead="Plan" totalLabel="All plans" empty="No scheduled tiffins this week." compare />
          </TabsContent>
          {dishes ? (
            <TabsContent value="dishes">
              <WeekTable rows={dishes} monday={monday} rowHead="Dish category" totalLabel="All containers" empty="No labels for this week yet (menu not released or nothing scheduled)." compare={false} />
            </TabsContent>
          ) : null}
        </Tabs>
      </ChartCard>
    </div>
  );
}

/** Rows × Mon–Sun with a thin bar per cell, a total, and a 7-day mini chart. */
function WeekTable({ rows, monday, rowHead, totalLabel, empty, compare }: { rows: KitchenWeekRow[]; monday: string; rowHead: string; totalLabel: string; empty: string; compare: boolean }) {
  if (rows.length === 0) return <p className="text-muted-foreground text-sm">{empty}</p>;
  const max = Math.max(1, ...rows.flatMap((r) => r.days));
  const total = rows.reduce((s, r) => s + r.total, 0);
  const prev = rows.reduce((s, r) => s + r.prevTotal, 0);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{rowHead}</TableHead>
          {DAYS.map((d, i) => (
            <TableHead key={d} className="text-right">
              {d}
              <span className="text-muted-foreground block text-xs font-normal">{addDays(monday, i).slice(8)}</span>
            </TableHead>
          ))}
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Week</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const d = delta(r.total, r.prevTotal);
          return (
            <TableRow key={r.mealSize}>
              <TableCell className="font-medium">{r.mealSize}</TableCell>
              {r.days.map((v, i) => (
                <TableCell key={i} className="text-right tabular-nums">
                  {v}
                  <div aria-hidden className="bg-muted mt-1 ml-auto h-1 w-10 rounded-full">
                    <div className="h-full rounded-full" style={{ width: `${(v / max) * 100}%`, background: "var(--chart-1)" }} />
                  </div>
                </TableCell>
              ))}
              <TableCell className="text-right">
                <span className="tabular-nums">{r.total}</span>
                {compare ? (
                  <>
                    {" "}
                    <Badge variant={d.tone === "ok" ? "success-light" : d.tone === "bad" ? "warning-light" : "secondary"}>{d.text}</Badge>
                  </>
                ) : null}
              </TableCell>
              <TableCell>
                <div className="flex justify-end">
                  <MiniBars values={r.days} />
                </div>
              </TableCell>
            </TableRow>
          );
        })}
        <TableRow>
          <TableCell className="font-medium">{totalLabel}</TableCell>
          {DAYS.map((d, i) => (
            <TableCell key={d} className="text-right tabular-nums">
              {rows.reduce((s, r) => s + r.days[i]!, 0)}
            </TableCell>
          ))}
          <TableCell className="text-right tabular-nums">{total}</TableCell>
          <TableCell className="text-muted-foreground text-right text-xs">{compare ? `${prev} last week` : null}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}
