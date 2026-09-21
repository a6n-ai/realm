"use client";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef } from "react";
import { STATUS_LABEL, type DeliveryStatus } from "@/components/customer/kit";
import { cn, FONT, FOCUS } from "@/components/customer/kit/cn";
import { addDays, weekDays } from "@/lib/deliveries-view/week";

export type StripDot = { orderId: string; status: DeliveryStatus };

const WD = ["M", "T", "W", "T", "F", "S", "S"];
const MON = new Intl.DateTimeFormat("en-CA", { month: "short", timeZone: "UTC" });
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const RING: Record<DeliveryStatus, string | null> = { delivered: "var(--s-delivered,#10b981)", hold: "var(--s-hold,#f43f5e)", vacation: "var(--s-vac,#d98a00)", combined: "var(--muted-foreground,#6E6558)", upcoming: null };

/** Plan-coloured dot; the ring carries status so colour is never the only signal. */
function Dot({ color, status }: { color: string; status: DeliveryStatus }) {
  const ring = RING[status];
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 rounded-full"
      style={{ background: status === "combined" ? "transparent" : color, boxShadow: ring ? `0 0 0 1.5px ${ring}` : undefined, border: status === "combined" ? `1.5px dashed ${color}` : undefined }}
    />
  );
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
}

export function WeekStrip({ firstWeek, lastWeek, week, today, selectedDay, dots, colorOf, onPickDay, onWeek }: Props) {
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
      <button type="button" aria-label="Previous week" disabled={week <= firstWeek} onClick={() => onWeek(addDays(week, -7))} className={cn(arrow, FOCUS)}><ChevronLeft aria-hidden className="size-5" /></button>
      <div ref={box} role="group" aria-label="Delivery days" className="flex min-w-0 flex-1 snap-x snap-mandatory gap-2 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none]">
        {weeks.map((w) => {
          const cur = w === week;
          return (
            <div
              key={w}
              data-week={w}
              aria-current={cur ? "true" : undefined}
              className={cn("w-full shrink-0 snap-start rounded-2xl border-[1.5px] p-2 lg:w-[calc(50%-4px)]", cur ? "border-[var(--primary)] bg-[var(--muted)]/50" : "border-[var(--border)]")}
            >
              <button type="button" onClick={() => onWeek(w)} className={cn(FOCUS, "mb-1 min-h-8 px-1 text-xs font-semibold uppercase tracking-[0.15em] text-[var(--muted-foreground,#6E6558)] [touch-action:manipulation]")}>
                {label(w)}{w === mondayOfToday(today) ? " · This week" : ""}
              </button>
              <div className="grid grid-cols-7 gap-1">
                {weekDays(w).map((iso, i) => {
                  const ds = dots[iso] ?? [];
                  const sel = iso === selectedDay;
                  const text = `${d(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" })}${ds.length ? `, ${ds.map((x) => STATUS_LABEL[x.status]).join(", ")}` : ", no delivery"}`;
                  return (
                    <button
                      key={iso}
                      type="button"
                      aria-label={text}
                      aria-pressed={sel}
                      data-day={iso}
                      onClick={() => onPickDay(iso)}
                      className={cn(FOCUS, "flex h-[68px] min-w-0 flex-col items-center justify-center gap-1 rounded-[14px] border-[1.5px] text-xs [touch-action:manipulation] motion-reduce:transition-none", sel ? "border-[var(--primary)] bg-[var(--primary-wash,#FBE3D2)] font-semibold text-[var(--foreground)]" : "border-transparent bg-[var(--card)]", iso < today && !sel && "opacity-60")}
                    >
                      <span aria-hidden className="opacity-80">{WD[i]}</span>
                      <b aria-hidden className={cn("grid size-7 place-items-center rounded-full text-[16px] tabular-nums", iso === today && !sel && "border-2 border-[var(--primary)]")}>{d(iso).getUTCDate()}</b>
                      <span aria-hidden className="flex h-2.5 items-center gap-0.5">
                        {ds.map((x, k) => <Dot key={k} color={colorOf(x.orderId)} status={x.status} />)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <button type="button" aria-label="Next week" disabled={week >= lastWeek} onClick={() => onWeek(addDays(week, 7))} className={cn(arrow, FOCUS)}><ChevronRight aria-hidden className="size-5" /></button>
    </div>
  );
}

function mondayOfToday(today: string) {
  return addDays(today, -((d(today).getUTCDay() + 6) % 7));
}
