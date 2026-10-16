"use client";

import { Truck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@foundry/ui/card";
import { cn } from "@foundry/ui/cn";
import { STATUS_COLOR, type DeliveryStatus } from "@/components/customer/kit";
import { addDays, dotStatus, weekDays, type Agenda, type AgendaDot } from "@/lib/deliveries-view/week";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MON = new Intl.DateTimeFormat("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
const LONG = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
const at = (iso: string) => new Date(`${iso}T00:00:00Z`);

// The statuses staff set in the delivery status dropdown, which splits two the strip merges:
// past the cutoff an unconfirmed day is awaiting confirmation, and a driver-failed drop is not an admin hold.
export type BoxStatus = DeliveryStatus | "awaiting" | "not-delivered";
export const BOX_COLOR: Record<BoxStatus, string> = { ...STATUS_COLOR, awaiting: "#8b5cf6", "not-delivered": "#b91c1c" };
export const BOX_LABEL: Record<BoxStatus, string> = {
  delivered: "Delivered",
  upcoming: "Upcoming",
  awaiting: "Awaiting confirmation",
  paused: "Paused",
  hold: "On hold",
  "not-delivered": "Not delivered",
  combined: "Moved",
  holiday: "Holiday",
};
const LEGEND: BoxStatus[] = ["delivered", "awaiting", "upcoming", "hold", "not-delivered", "paused", "holiday", "combined"];

export function boxStatus(d: AgendaDot, now: number): BoxStatus {
  const s = dotStatus(d, now);
  if (s === "hold") return d.optimoCompletionStatus === "failed" ? "not-delivered" : "hold";
  return s === "upcoming" && d.cutoffAt <= now ? "awaiting" : s;
}

interface Props {
  agenda: Agenda;
  firstWeek: string;
  lastWeek: string;
  /** Monday of the week the hub is showing; its row is highlighted. */
  week: string;
  today: string;
  selectedDay: string | null;
  now: number;
  onPickDay: (iso: string) => void;
}

/** The whole plan at a glance: one row per week, one box per eating day, coloured by status. */
export function DeliveryMatrix({ agenda, firstWeek, lastWeek, week, today, selectedDay, now, onPickDay }: Props) {
  const weeks: string[] = [];
  for (let m = firstWeek; m <= lastWeek; m = addDays(m, 7)) weeks.push(m);
  const planEnd = addDays(lastWeek, 6);
  const deliveries = Object.entries(agenda).filter(([date, ds]) => date >= firstWeek && date <= planEnd && ds.some((d) => d.truck)).length;

  return (
    <Card data-testid="delivery-matrix">
      <CardHeader className="flex flex-row items-baseline justify-between gap-2">
        <CardTitle className="text-base">All deliveries</CardTitle>
        <span className="text-muted-foreground text-xs tabular-nums">
          {deliveries} {deliveries === 1 ? "delivery" : "deliveries"} · {weeks.length} {weeks.length === 1 ? "week" : "weeks"}
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-[auto_repeat(7,minmax(0,1fr))] items-center gap-1">
          <span />
          {WEEKDAYS.map((d) => (
            <span key={d} className="text-muted-foreground text-center text-[10px] font-semibold uppercase tracking-wide">{d}</span>
          ))}
          {weeks.map((monday) => (
            <Week key={monday} monday={monday} current={monday === week} agenda={agenda} today={today} selectedDay={selectedDay} now={now} onPickDay={onPickDay} />
          ))}
        </div>
        <ul className="text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 border-t pt-3 text-xs">
          {LEGEND.map((s) => (
            <li key={s} className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-sm" style={box(s)} />
              {BOX_LABEL[s]}
            </li>
          ))}
          <li className="flex items-center gap-1.5"><Truck aria-hidden className="size-3" />Delivery day</li>
        </ul>
      </CardContent>
    </Card>
  );
}

const box = (s: BoxStatus): React.CSSProperties =>
  s === "combined"
    ? { border: `1px dashed ${BOX_COLOR.combined}` }
    : { background: `color-mix(in srgb, ${BOX_COLOR[s]} ${s === "not-delivered" ? 45 : 22}%, transparent)`, border: `1px solid color-mix(in srgb, ${BOX_COLOR[s]} 55%, transparent)` };

function Week({ monday, current, agenda, today, selectedDay, now, onPickDay }: Omit<Props, "firstWeek" | "lastWeek" | "week"> & { monday: string; current: boolean }) {
  return (
    <>
      <span className={cn("pr-1 text-right text-[11px] tabular-nums", current ? "text-foreground font-semibold" : "text-muted-foreground")}>{MON.format(at(monday))}</span>
      {weekDays(monday).map((iso) => {
        const dots = agenda[iso] ?? [];
        const dot = dots[0];
        const day = at(iso).getUTCDate();
        if (!dot) {
          return <span key={iso} className={cn("text-muted-foreground/50 grid h-10 place-items-center rounded-md text-xs tabular-nums", iso === today && "ring-primary ring-1")}>{day}</span>;
        }
        const status = boxStatus(dot, now);
        const truck = dots.find((d) => d.truck);
        const label = `${LONG.format(at(iso))}, ${BOX_LABEL[status]}${truck ? `, delivery with ${truck.units} ${truck.units === 1 ? "tiffin" : "tiffins"}` : ""}`;
        return (
          <button
            key={iso}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={iso === selectedDay}
            onClick={() => onPickDay(iso)}
            style={box(status)}
            className={cn(
              "focus-visible:ring-ring flex h-10 cursor-pointer flex-col items-center justify-center rounded-md text-xs font-semibold tabular-nums outline-none focus-visible:ring-2",
              iso === selectedDay ? "ring-foreground ring-2" : cn("hover:ring-foreground/40 hover:ring-2", iso === today && "ring-primary ring-1"),
            )}
          >
            {day}
            <span aria-hidden className="flex h-3 items-center gap-0.5 text-[9px] font-medium">
              {truck ? (
                <>
                  <Truck className="size-3" />
                  {truck.units > 1 && truck.units}
                </>
              ) : null}
            </span>
          </button>
        );
      })}
    </>
  );
}
