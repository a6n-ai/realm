"use client";

import { useState } from "react";
import { Button } from "@foundry/ui/button";
import { Card } from "@/components/ds";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { Badge } from "@/components/reui/badge";
import type { KitchenWeekRow } from "@/lib/overview/kitchen-week";
import type { KitchenCount } from "@/lib/services/daily-labels.service";
import { delta } from "@/lib/overview/delta";
import { KitchenCounts } from "../labels/labels-view";
import { DAY_SHORT, WEEK_DAYS } from "@/lib/dates/weekdays";

const dayNum = (iso: string) => iso.slice(8).replace(/^0/, "");
const containers = (counts: KitchenCount[]) => counts.reduce((s, c) => s + c.count, 0);

/**
 * Kitchen week as cards, like Daily labels: by plan (a card per plan, a chip per day) and by dish
 * (pick a day, then the same station cards the label sheet shows: roti pieces, oz and lb to cook).
 */
export function KitchenWeekView({
  plans,
  dishes,
  dates,
  defaultDay,
}: {
  plans: KitchenWeekRow[];
  dishes: { date: string; counts: KitchenCount[] }[] | null;
  dates: string[];
  defaultDay: string;
}) {
  const [day, setDay] = useState(defaultDay);
  const selected = dishes?.find((d) => d.date === day)?.counts ?? [];
  return (
    <Tabs defaultValue={dishes ? "dishes" : "plans"} className="gap-4">
      <TabsList>
        {dishes ? <TabsTrigger value="dishes">By dish</TabsTrigger> : null}
        <TabsTrigger value="plans">By plan</TabsTrigger>
      </TabsList>

      {dishes ? (
        <TabsContent value="dishes" className="flex flex-col gap-4">
          <nav aria-label="Day" className="flex flex-wrap gap-2">
            {dishes.map((d, i) => (
              <Button key={d.date} size="sm" variant={d.date === day ? "secondary" : "ghost"} aria-pressed={d.date === day} onClick={() => setDay(d.date)}>
                {DAY_SHORT[WEEK_DAYS[i]!]} {dayNum(d.date)}
                <span className="text-muted-foreground tabular-nums">{containers(d.counts).toLocaleString()}</span>
              </Button>
            ))}
          </nav>
          <KitchenCounts counts={selected} byRoute={[]} />
        </TabsContent>
      ) : null}

      <TabsContent value="plans">
        {plans.length === 0 ? (
          <p className="text-muted-foreground text-sm">No scheduled tiffins this week.</p>
        ) : (
          <div className="grid items-start gap-4 md:grid-cols-2">
            {plans.map((p) => {
              const d = delta(p.total, p.prevTotal);
              return (
                <Card key={p.mealSize} variant="flat" className="overflow-hidden p-0">
                  <div className="flex items-baseline justify-between gap-3 border-b px-4 py-3">
                    <h3 className="truncate text-base font-semibold tracking-tight">{p.mealSize}</h3>
                    <p className="text-muted-foreground shrink-0 text-sm tabular-nums">
                      <span className="text-foreground text-lg font-semibold">{p.total.toLocaleString()}</span> tiffins{" "}
                      <Badge variant={d.tone === "ok" ? "success-light" : d.tone === "bad" ? "warning-light" : "secondary"}>{d.text}</Badge>
                    </p>
                  </div>
                  <dl className="flex flex-wrap gap-2 px-4 py-3">
                    {p.days.map((v, i) => (
                      <div key={dates[i]} className="bg-muted/60 flex min-w-16 flex-col rounded-md px-2.5 py-1.5">
                        <dt className="text-muted-foreground text-xs">
                          {DAY_SHORT[WEEK_DAYS[i]!]} {dayNum(dates[i]!)}
                        </dt>
                        <dd className="text-xl leading-tight font-semibold tabular-nums">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </Card>
              );
            })}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
