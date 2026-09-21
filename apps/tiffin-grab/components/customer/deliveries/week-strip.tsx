"use client";
import { ChevronLeft, ChevronRight, Truck, Utensils } from "lucide-react";
import { useEffect, useRef } from "react";
import { StatusDot, STATUS_LABEL, type DeliveryStatus } from "@/components/customer/kit";
import { cn, FONT, FOCUS } from "@/components/customer/kit/cn";
import { addDays, weekDays } from "@/lib/deliveries-view/week";

export type StripDot = { orderId: string; status: DeliveryStatus; truck: boolean };

const WD = ["M", "T", "W", "T", "F", "S", "S"];
const MON = new Intl.DateTimeFormat("en-CA", { month: "short", timeZone: "UTC" });
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
/** Status dot: colour is the delivery status (delivered, upcoming, hold, vacation), not the plan. */
function Dot({ status }: { status: DeliveryStatus }) {
  return <StatusDot decorative status={status} className="size-2.5" />;
}

const label = (r: string) => `${MON.format(d(r))} ${d(r).getUTCDate()} – ${MON.format(d(addDays(r, 6))) === MON.format(d(r)) ? "" : `${MON.format(d(addDays(r, 6)))} `}${d(addDays(r, 6)).getUTCDate()}`;

interface Props {
  firstWeek: string;
  lastWeek: string;
  week: string;
  today: string;
  selectedDay: string | null;
  dots: Record<string, StripDot[]>;
  colorOf: (orderId: string) => string;
  onPickDay: (iso: string) => void;
  onWeek: (monday: string) => void;
  /** Picker mode (move sheet): one week per screen, arrows in the header, no meal dots, unpickable days greyed. */
  picker?: { isDisabled: (iso: string) => boolean; onDisabledTap?: (iso: string) => void };
}

export function WeekStrip({ firstWeek, lastWeek, week, today, selectedDay, dots, colorOf, onPickDay, onWeek, picker }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const weeks: string[] = [];
  for (let w = firstWeek; w <= lastWeek; w = addDays(w, 7)) weeks.push(w);

  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>(`[data-week="${week}"]`);
    if (el && box.current?.scrollTo) box.current.scrollTo({ left: el.offsetLeft - box.current.offsetLeft, behavior: "smooth" });
  }, [week]);

  const arrow = "hidden size-11 shrink-0 place-items-center self-center rounded-full hover:bg-[var(--muted)] disabled:opacity-30 lg:grid [touch-action:manipulation]";
  return (
    <div className={cn(FONT, "flex gap-1")} data-testid="week-strip">
      {!picker && <button type="button" aria-label="Previous week" disabled={week <= firstWeek} onClick={() => onWeek(addDays(week, -7))} className={cn(arrow, FOCUS)}><ChevronLeft aria-hidden className="size-5" /></button>}
      <div ref={box} role="group" aria-label="Delivery days" className="flex min-w-0 flex-1 snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none]">
        {weeks.map((w) => {
          const cur = w === week;
          return (
            <div
              key={w}
              data-week={w}
              aria-current={cur ? "true" : undefined}
              className={cn("w-full shrink-0 snap-start rounded-2xl border-[1.5px] p-2", !picker && "lg:w-[calc(50%-4px)]", cur ? "border-[var(--primary)] bg-[var(--muted)]/50" : "border-[var(--border)]")}
            >
              <div className="mb-1 flex items-center justify-between">
                <button type="button" onClick={() => onWeek(w)} className={cn(FOCUS, "min-h-8 px-1 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--muted-foreground,#6E6558)] [touch-action:manipulation]")}>
                  {label(w)}{w === mondayOfToday(today) ? " · This week" : ""}
                </button>
                {cur && (
                  <span className={cn("flex", !picker && "lg:hidden")}>
                    <button type="button" aria-label="Previous week" disabled={week <= firstWeek} onClick={() => onWeek(addDays(week, -7))} className={cn(FOCUS, "grid size-9 place-items-center rounded-full disabled:opacity-30 [touch-action:manipulation]")}><ChevronLeft aria-hidden className="size-5" /></button>
                    <button type="button" aria-label="Next week" disabled={week >= lastWeek} onClick={() => onWeek(addDays(week, 7))} className={cn(FOCUS, "grid size-9 place-items-center rounded-full disabled:opacity-30 [touch-action:manipulation]")}><ChevronRight aria-hidden className="size-5" /></button>
                  </span>
                )}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {weekDays(w).map((iso, i) => {
                  const ds = dots[iso] ?? [];
                  const sel = iso === selectedDay;
                  const off = picker?.isDisabled(iso) ?? false;
                  const text = `${d(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}${ds.length ? `, eating, ${ds.map((x) => STATUS_LABEL[x.status]).join(", ")}${ds.some((x) => x.truck) ? ", delivery arrives" : ""}` : ", nothing planned"}`;
                  return (
                    <button
                      key={iso}
                      type="button"
                      aria-label={picker ? `${text.replace(/, (eating|nothing planned).*$/, "")}${ds.some((x) => x.truck) ? ", delivery day" : ""}${off ? ", unavailable" : ""}` : text}
                      aria-pressed={sel}
                      aria-disabled={off || undefined}
                      data-day={iso}
                      onClick={() => (off ? picker?.onDisabledTap?.(iso) : onPickDay(iso))}
                      className={cn(FOCUS, "relative flex h-[76px] min-w-0 flex-col items-center justify-center gap-1 rounded-[14px] border-[1.5px] text-xs [touch-action:manipulation] motion-reduce:transition-none", sel ? "border-[var(--primary)] bg-[var(--primary-wash,#FBE3D2)] font-semibold text-[var(--foreground)]" : "border-transparent bg-[var(--card)]", (iso < today || off) && !sel && "opacity-40")}
                    >
                      <span aria-hidden className="grid w-full grid-cols-[1fr_auto_1fr] items-center px-1">
                        <span className="flex justify-end">{ds.length > 0 && <Utensils className="size-2.5 text-[var(--muted-foreground,#6E6558)]" />}</span>
                        <span className="px-1 opacity-80">{WD[i]}</span>
                        <span className="flex justify-start">{ds.some((x) => x.truck) && <Truck className="size-2.5 text-[var(--muted-foreground,#6E6558)]" />}</span>
                      </span>
                      <b aria-hidden className={cn("grid size-7 place-items-center rounded-full text-[16px] tabular-nums", iso === today && !sel && "border-2 border-[var(--primary)]")}>{d(iso).getUTCDate()}</b>
                      <span aria-hidden className="flex h-3 items-center justify-center gap-0.5">
                        {!picker && ds.map((x, k) => <Dot key={k} status={x.status} />)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {!picker && <button type="button" aria-label="Next week" disabled={week >= lastWeek} onClick={() => onWeek(addDays(week, 7))} className={cn(arrow, FOCUS)}><ChevronRight aria-hidden className="size-5" /></button>}
    </div>
  );
}

function mondayOfToday(today: string) {
  return addDays(today, -((d(today).getUTCDay() + 6) % 7));
}
