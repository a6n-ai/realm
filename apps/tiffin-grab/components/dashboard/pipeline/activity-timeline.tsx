"use client";

import { useState } from "react";
import { ChevronDownIcon, ChevronUpIcon, ScrollTextIcon, type LucideIcon } from "lucide-react";
import { zonedDateIso } from "@foundry/commons";
import { Badge } from "@/components/reui/badge";
import { Button } from "@foundry/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@foundry/ui/collapsible";
import { cn } from "@foundry/ui/cn";
import { Timeline, TimelineContent, TimelineDate, TimelineHeader, TimelineIndicator, TimelineItem, TimelineSeparator, TimelineTitle } from "@/components/reui/timeline";
import { useTimezone } from "@foundry/design-system/timezone-provider";
import { formatEpoch } from "@/lib/format/datetime";

export type ActivityItem = {
  id: string;
  type: string;
  icon: LucideIcon;
  tone: string;
  title: string;
  note: string | null;
  outcome: string | null;
  nextFollowUpAt: number | null;
  createdAt: number;
  actor: { label: string; kind: "system" | "staff" | "customer" };
  /** Automatic events; collapsed under "All" when `grouped`. */
  system?: boolean;
};

export type ActivityFilter = { key: string; label: string; types: readonly string[] | null };

/** `grouped` adds day headers, and under the unfiltered list collapses `system` items per day. */
/** `now` comes from the server page: a client Date.now() here would hydrate Today/Yesterday differently. */
export function ActivityTimeline({
  items, filters, onAddNote, grouped = false, now,
}: {
  items: ActivityItem[];
  filters: ActivityFilter[];
  onAddNote: () => void;
  grouped?: boolean;
  now: number;
}) {
  const tz = useTimezone();
  const [filter, setFilter] = useState(filters[0]?.key ?? "");
  const types = filters.find((f) => f.key === filter)?.types ?? null;
  const rows = (types ? items.filter((a) => types.includes(a.type)) : items)
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt);

  if (items.length === 0) {
    return (
      <div className="text-muted-foreground grid place-items-center gap-3 py-10 text-sm">
        <span className="bg-muted grid size-12 place-items-center rounded-xl"><ScrollTextIcon className="size-6" /></span>
        No activity yet
        <Button size="sm" variant="outline" onClick={onAddNote}>Add note</Button>
      </div>
    );
  }

  const renderRows = (list: ActivityItem[]) => (
    <Timeline defaultValue={0}>
      {list.map((a, i) => {
        const Icon = a.icon;
        return (
          <TimelineItem key={a.id} step={i + 1} className="group-data-[orientation=vertical]/timeline:ms-10">
            <TimelineHeader>
              <TimelineSeparator className="bg-input! group-data-[orientation=vertical]/timeline:-left-7 group-data-[orientation=vertical]/timeline:h-[calc(100%-1.75rem-0.25rem)] group-data-[orientation=vertical]/timeline:translate-y-7.5" />
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <TimelineTitle className="text-sm">{a.title}</TimelineTitle>
                <TimelineDate className="mb-0 tabular-nums">{formatEpoch(a.createdAt, { mode: "datetime", timeZone: tz })}</TimelineDate>
              </div>
              <TimelineIndicator className="bg-card flex size-7 items-center justify-center border group-data-[orientation=vertical]/timeline:-left-7">
                <Icon className={cn("size-3.5", a.tone)} />
              </TimelineIndicator>
            </TimelineHeader>
            <TimelineContent>
              <div className="flex flex-col gap-1">
                <p className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={a.actor.kind === "system" ? "text-muted-foreground" : "text-foreground"}>{a.actor.label}</span>
                  {a.actor.kind === "system" ? null : (
                    <Badge variant={a.actor.kind === "staff" ? "secondary" : "outline"}>{a.actor.kind === "staff" ? "Staff" : "Customer"}</Badge>
                  )}
                </p>
                {a.note ? <p className="text-muted-foreground text-sm break-words whitespace-pre-wrap">{a.note}</p> : null}
                {a.outcome || a.nextFollowUpAt != null ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {a.outcome ? <Badge variant="outline">{a.outcome}</Badge> : null}
                    {a.nextFollowUpAt != null ? (
                      <Badge variant="info-light">Follow-up {formatEpoch(a.nextFollowUpAt, { mode: "date", timeZone: tz })}</Badge>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </TimelineContent>
          </TimelineItem>
        );
      })}
    </Timeline>
  );

  const filterBar = (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((f) => (
        <Button key={f.key} type="button" size="sm" variant={filter === f.key ? "default" : "outline"} onClick={() => setFilter(f.key)}>
          {f.label}
        </Button>
      ))}
    </div>
  );

  if (!grouped) {
    return (
      <div className="flex flex-col gap-4">
        {filterBar}
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">Nothing matches this filter.</p>
        ) : renderRows(rows)}
      </div>
    );
  }

  const collapse = types === null;
  const todayKey = zonedDateIso(now, tz);
  const yesterdayKey = zonedDateIso(now - 86_400_000, tz);
  const days: { key: string; rows: ActivityItem[] }[] = [];
  for (const r of rows) {
    const key = zonedDateIso(r.createdAt, tz);
    const last = days[days.length - 1];
    if (last && last.key === key) last.rows.push(r);
    else days.push({ key, rows: [r] });
  }

  return (
    <div className="flex flex-col gap-4">
      {filterBar}
      {rows.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">Nothing matches this filter.</p>
      ) : (
        days.map((day) => {
          const main = collapse ? day.rows.filter((r) => !r.system) : day.rows;
          const system = collapse ? day.rows.filter((r) => r.system) : [];
          const label = day.key === todayKey ? "Today" : day.key === yesterdayKey ? "Yesterday" : formatEpoch(day.rows[0]!.createdAt, { mode: "date", timeZone: tz });
          return (
            <section key={day.key} className="flex flex-col gap-3">
              <h3 className="text-muted-foreground text-xs font-medium">{label}</h3>
              {main.length ? renderRows(main) : null}
              {system.length ? <SystemEvents items={system} /> : null}
            </section>
          );
        })
      )}
    </div>
  );
}

function SystemEvents({ items }: { items: ActivityItem[] }) {
  const tz = useTimezone();
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronUpIcon : ChevronDownIcon;
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground w-fit">
          <Chevron aria-hidden />
          {items.length} system {items.length === 1 ? "event" : "events"}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="text-muted-foreground flex flex-col gap-1 pt-1 text-xs">
          {items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span>{a.title}</span>
              <span className="tabular-nums">{formatEpoch(a.createdAt, { mode: "datetime", timeZone: tz })}</span>
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
