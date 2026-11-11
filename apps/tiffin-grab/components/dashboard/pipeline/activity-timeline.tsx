"use client";

import { useState } from "react";
import { ScrollTextIcon, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/reui/badge";
import { Button } from "@foundry/ui/button";
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
};

export type ActivityFilter = { key: string; label: string; types: readonly string[] | null };

export function ActivityTimeline({
  items, filters, onAddNote,
}: {
  items: ActivityItem[];
  filters: ActivityFilter[];
  onAddNote: () => void;
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {filters.map((f) => (
          <Button key={f.key} type="button" size="sm" variant={filter === f.key ? "default" : "outline"} onClick={() => setFilter(f.key)}>
            {f.label}
          </Button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">Nothing matches this filter.</p>
      ) : (
        <Timeline defaultValue={0}>
          {rows.map((a, i) => {
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
      )}
    </div>
  );
}
