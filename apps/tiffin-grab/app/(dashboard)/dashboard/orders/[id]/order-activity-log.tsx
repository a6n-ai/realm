"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRightIcon, CircleDotIcon, CreditCardIcon, GiftIcon, MapPinIcon, MessageSquareTextIcon, PauseIcon,
  PlayIcon, RepeatIcon, ScrollTextIcon, SearchIcon, TruckIcon, UtensilsIcon, XCircleIcon, type LucideIcon,
} from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Skeleton } from "@foundry/ui/skeleton";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import { useTimezone } from "@/components/providers/timezone-provider";
import { Timeline, TimelineContent, TimelineDate, TimelineHeader, TimelineIndicator, TimelineItem, TimelineSeparator, TimelineTitle } from "@/components/reui/timeline";
import { formatEpoch } from "@/lib/format/datetime";
import { describeActivity, describeActivityActor } from "@/lib/services/order-activity-describe";
import { cn } from "@foundry/ui/cn";
import { filterActivityRows, ORDER_ACTIVITY_FACETS } from "./activity-facets";

export type OrderActivityLogRow = {
  publicId: string;
  type: string;
  note: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  createdAt: number;
  createdBy: bigint | null;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: string | null;
};

type ViewRow = OrderActivityLogRow & {
  action: string;
  actorLabel: string;
  actorKind: "system" | "staff" | "customer";
};

// Routine route sync: one line per day instead of a row per push.
const ROUTE = new Set(["route_pushed", "route_completed"]);

const ICON: Record<string, { icon: LucideIcon; tone: string }> = {
  created: { icon: CircleDotIcon, tone: "text-sky-500" },
  activated: { icon: PlayIcon, tone: "text-emerald-500" },
  resumed: { icon: PlayIcon, tone: "text-emerald-500" },
  unskipped: { icon: PlayIcon, tone: "text-emerald-500" },
  paused: { icon: PauseIcon, tone: "text-amber-500" },
  skipped: { icon: PauseIcon, tone: "text-amber-500" },
  cancelled: { icon: XCircleIcon, tone: "text-red-500" },
  status_change: { icon: CircleDotIcon, tone: "text-sky-500" },
  pool_scheduled: { icon: ArrowRightIcon, tone: "text-violet-500" },
  complimentary_granted: { icon: GiftIcon, tone: "text-pink-500" },
  delivery_address_changed: { icon: MapPinIcon, tone: "text-sky-500" },
  meal_pick: { icon: UtensilsIcon, tone: "text-orange-500" },
  category_swap_applied: { icon: RepeatIcon, tone: "text-orange-500" },
  category_swap_removed: { icon: RepeatIcon, tone: "text-orange-500" },
  payment_claimed: { icon: CreditCardIcon, tone: "text-emerald-500" },
  payment_verified: { icon: CreditCardIcon, tone: "text-emerald-500" },
  payment_rejected: { icon: CreditCardIcon, tone: "text-red-500" },
  note: { icon: MessageSquareTextIcon, tone: "text-muted-foreground" },
};
const ROUTE_ICON = { icon: TruckIcon, tone: "text-muted-foreground" };

type Entry = { kind: "row"; row: ViewRow } | { kind: "route"; key: string; sent: number; delivered: number; rows: ViewRow[] };
type Day = { key: string; label: string; entries: Entry[] };

const DAYS_PER_PAGE = 14;

function ActorBadge({ kind, label }: { kind: ViewRow["actorKind"]; label: string }) {
  if (kind === "system") return <span className="text-muted-foreground">{label}</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-foreground">{label}</span>
      <Badge variant={kind === "staff" ? "secondary" : "outline"} className="text-[10px]">{kind === "staff" ? "Staff" : "Customer"}</Badge>
    </span>
  );
}

/** One timeline entry: icon on the rail, title row, body below. */
function Item({ step, type, title, time, children }: { step: number; type: string; title: React.ReactNode; time?: string; children?: React.ReactNode }) {
  const { icon: Icon, tone } = ROUTE.has(type) ? ROUTE_ICON : ICON[type] ?? ICON.note!;
  return (
    <TimelineItem step={step} className="group-data-[orientation=vertical]/timeline:ms-10">
      <TimelineHeader>
        <TimelineSeparator className="bg-input! group-data-[orientation=vertical]/timeline:-left-7 group-data-[orientation=vertical]/timeline:h-[calc(100%-1.75rem-0.25rem)] group-data-[orientation=vertical]/timeline:translate-y-7.5" />
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <TimelineTitle className="text-sm">{title}</TimelineTitle>
          {time ? <TimelineDate className="mb-0 tabular-nums">{time}</TimelineDate> : null}
        </div>
        <TimelineIndicator className="bg-card flex size-7 items-center justify-center border group-data-[orientation=vertical]/timeline:-left-7">
          <Icon className={cn("size-3.5", tone)} />
        </TimelineIndicator>
      </TimelineHeader>
      {children ? <TimelineContent>{children}</TimelineContent> : null}
    </TimelineItem>
  );
}

/** Newest day first; inside a day, newest first, with that day's route sync folded into one line. */
function groupByDay(rows: ViewRow[], tz: string): Day[] {
  const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: tz });
  const today = dayKey.format(Date.now());
  const days = new Map<string, Day>();
  for (const row of [...rows].sort((a, b) => b.createdAt - a.createdAt)) {
    const key = dayKey.format(row.createdAt);
    let day = days.get(key);
    if (!day) {
      day = { key, label: key === today ? "Today" : formatEpoch(row.createdAt, { mode: "date", timeZone: tz }), entries: [] };
      days.set(key, day);
    }
    if (!ROUTE.has(row.type)) {
      day.entries.push({ kind: "row", row });
      continue;
    }
    let route = day.entries.find((e): e is Extract<Entry, { kind: "route" }> => e.kind === "route");
    if (!route) {
      route = { kind: "route", key: `${key}-route`, sent: 0, delivered: 0, rows: [] };
      day.entries.push(route);
    }
    route.rows.push(row);
    if (row.type === "route_pushed") route.sent++;
    else route.delivered++;
  }
  return [...days.values()];
}

function RouteLine({ entry, fmt }: { entry: Extract<Entry, { kind: "route" }>; fmt: (ms: number) => string }) {
  const parts = [entry.sent ? `sent ${entry.sent}×` : null, entry.delivered ? `delivered${entry.delivered > 1 ? ` ${entry.delivered}×` : ""}` : null].filter(Boolean);
  return (
    <details className="group text-sm">
      <summary className="text-muted-foreground cursor-pointer list-none py-1 marker:hidden hover:text-foreground">
        OptimoRoute: {parts.join(" · ")} <span className="text-xs underline-offset-2 group-open:hidden hover:underline">show</span>
      </summary>
      <ul className="text-muted-foreground mt-1 space-y-0.5 text-xs">
        {entry.rows.map((r) => (
          <li key={r.publicId}><span className="tabular-nums">{fmt(r.createdAt)}</span> · {r.action}{r.note ? ` · ${r.note}` : ""} · {r.actorLabel}</li>
        ))}
      </ul>
    </details>
  );
}

export function OrderActivityLog({ activities }: { activities: OrderActivityLogRow[] }) {
  const tz = useTimezone();
  const params = useSearchParams();
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(DAYS_PER_PAGE);

  const days = useMemo(() => {
    const view: ViewRow[] = activities.map((row) => {
      const actor = describeActivityActor(row);
      return { ...row, action: describeActivity(row), actorLabel: actor.label, actorKind: actor.kind };
    });
    const q = query.trim().toLowerCase();
    const matched = filterActivityRows(view, params).filter((r) =>
      !q || [r.action, r.actorLabel, r.actorEmail, r.note, r.type].some((s) => s?.toLowerCase().includes(q)));
    return groupByDay(matched, tz);
  }, [activities, params, query, tz]);

  const time = (ms: number) => formatEpoch(ms, { mode: "time", timeZone: tz });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search activity…" className="pl-8" />
        </div>
        <ReuiFacetFilters spec={ORDER_ACTIVITY_FACETS} />
      </div>

      {days.length === 0 ? (
        <div className="text-muted-foreground grid place-items-center gap-3 py-12 text-sm">
          <span className="bg-muted grid size-12 place-items-center rounded-xl"><ScrollTextIcon className="size-6" /></span>
          {query || params.toString() ? "No activity matches your search." : "No activity yet."}
        </div>
      ) : (
        <ol className="space-y-6">
          {days.slice(0, shown).map((day) => (
            <li key={day.key}>
              <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">{day.label}</h3>
              <Timeline defaultValue={0}>
                {day.entries.map((e, i) => e.kind === "route" ? (
                  <Item key={e.key} step={i + 1} type="route_pushed" title={<RouteLine entry={e} fmt={time} />} />
                ) : (
                  <Item key={e.row.publicId} step={i + 1} type={e.row.type} title={e.row.note && e.row.action.endsWith(` — ${e.row.note}`) ? e.row.action.slice(0, -(e.row.note.length + 3)) : e.row.action} time={time(e.row.createdAt)}>
                    <div className="space-y-1">
                      <p className="text-xs"><ActorBadge kind={e.row.actorKind} label={e.row.actorLabel} /></p>
                      {e.row.note && e.row.note !== e.row.action ? (
                        <p className="text-muted-foreground text-sm whitespace-pre-wrap break-words">{e.row.note}</p>
                      ) : e.row.fromStatus && e.row.toStatus ? (
                        <p className="text-muted-foreground text-sm">{e.row.fromStatus} → {e.row.toStatus}</p>
                      ) : null}
                    </div>
                  </Item>
                ))}
              </Timeline>
            </li>
          ))}
        </ol>
      )}
      {days.length > shown && (
        <Button variant="outline" size="sm" onClick={() => setShown((n) => n + DAYS_PER_PAGE)}>Show older activity</Button>
      )}
    </div>
  );
}

export function OrderActivityLogSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="size-7 rounded-full" />
          <div className="flex-1 space-y-1.5"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/2" /></div>
        </div>
      ))}
    </div>
  );
}
