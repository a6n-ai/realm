"use client";

import Link from "next/link";
import { useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, Check, Clock, Lock, Pause, UtensilsCrossed } from "lucide-react";
import { EmptyState, IconTile, Pill, Segmented, StatusDot, panelId, tabId, type DeliveryStatus, type IconTint } from "@/components/customer/kit";
import { buttonClass } from "@/components/customer/kit/button-class";
import { cn, FOCUS } from "@/components/customer/kit/cn";
import { useSwipePages } from "@/components/customer/kit/use-swipe-pages";
import { useTimezone } from "@/components/providers/timezone-provider";
import { makeCategoryLook } from "./category-look";
import type { MenuDay, MyDay } from "@/lib/menu/customer-week";

const at = (iso: string) => new Date(`${iso}T00:00:00Z`);
const WEEKDAY = new Intl.DateTimeFormat("en-CA", { weekday: "long", timeZone: "UTC" });
const SHORT = new Intl.DateTimeFormat("en-CA", { weekday: "short", timeZone: "UTC" });
const DATE = new Intl.DateTimeFormat("en-CA", { month: "long", day: "numeric", timeZone: "UTC" });

const DOT: Partial<Record<NonNullable<MyDay>, DeliveryStatus>> = { delivered: "delivered", paused: "paused", hold: "hold" };

// What this customer has on the selected day, and the one thing they can do about it.
const MINE: Record<NonNullable<MyDay>, { tint: IconTint; icon: typeof Check; label: string; note: string; action?: "Pick meals" | "View delivery" }> = {
  pick: { tint: "orange", icon: UtensilsCrossed, label: "Your delivery", note: "Choose from these dishes before the cutoff.", action: "Pick meals" },
  locked: { tint: "gray", icon: Lock, label: "Your delivery", note: "Past the cutoff, so this day's meals are set.", action: "View delivery" },
  delivered: { tint: "green", icon: Check, label: "Delivered", note: "This day has been delivered." },
  paused: { tint: "indigo", icon: Pause, label: "Paused", note: "You paused this day.", action: "View delivery" },
  hold: { tint: "pink", icon: Clock, label: "On hold", note: "This day is on hold.", action: "View delivery" },
};

/** The square-and-dot food mark Indian menus use, drawn in the diet's plan colour (plans.tag_color). */
function DietMark({ color }: { color?: string }) {
  return (
    <span aria-hidden className="grid size-3.5 shrink-0 place-items-center rounded-[3px] border-[1.5px]" style={{ borderColor: color ?? "var(--muted-foreground)" }}>
      <span className="size-1.5 rounded-full" style={{ background: color ?? "var(--muted-foreground)" }} />
    </span>
  );
}

/** iOS Calendar's week row on a floating glass capsule: one saffron lens slides to the chosen day. */
function WeekBar({ days, value, today, onChange }: { days: MenuDay[]; value: number; today: string; onChange: (i: number) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent) => {
    const to = { ArrowLeft: value - 1, ArrowRight: value + 1, Home: 0, End: days.length - 1 }[e.key];
    if (to === undefined || to < 0 || to >= days.length) return;
    e.preventDefault();
    onChange(to);
    refs.current[to]?.focus();
  };
  return (
    <div className="c-liquid sticky top-[calc(4.5rem+env(safe-area-inset-top))] z-30 rounded-[28px] p-1.5">
      <div role="group" aria-label="Day" onKeyDown={onKey} className="relative grid grid-cols-7">
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[calc(100%/7)] rounded-[22px] bg-[var(--primary)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          style={{ transform: `translateX(${value * 100}%)` }}
        />
        {days.map((d, i) => {
          const on = i === value;
          const status = d.mine ? DOT[d.mine] : undefined;
          const delivery = d.mine === "pick" || d.mine === "locked";
          return (
            <button
              key={d.date}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              aria-pressed={on}
              aria-label={`${WEEKDAY.format(at(d.date))}, ${DATE.format(at(d.date))}${d.date === today ? ", today" : ""}${delivery ? ", your delivery" : status ? `, ${MINE[d.mine!].label}` : ""}`}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(i)}
              className={cn(
                FOCUS,
                "relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-[22px] [touch-action:manipulation] transition-[color,transform] duration-150 active:scale-[.94] motion-reduce:transform-none",
                on ? "text-[var(--primary-foreground,#fff)]" : d.date === today ? "text-[var(--primary-text,var(--primary))]" : "text-[var(--foreground)]",
              )}
            >
              <span aria-hidden className={cn("text-xs font-semibold", !on && "opacity-70")}>{SHORT.format(at(d.date)).slice(0, 3)}</span>
              <b aria-hidden className="text-[17px] leading-none tabular-nums">{at(d.date).getUTCDate()}</b>
              <span aria-hidden className="flex h-1.5 items-center">
                {delivery ? <span className={cn("size-1.5 rounded-full", on ? "bg-current" : "bg-[var(--primary)]")} /> : status ? <StatusDot decorative status={status} className="size-1.5" /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The released week: a glass week bar marked with this customer's delivery days, and the chosen day's dishes as inset-grouped lists. */
export function WeeklyMenu({ days: full, plan, legend, initial, today }: { days: MenuDay[]; plan: { name: string; days: MenuDay[] } | null; legend: { label: string; color: string }[]; initial: string; today: string }) {
  const tz = useTimezone();
  const [selected, setSelected] = useState(initial);
  // Everyone sees what the kitchen makes; a customer on one plan can narrow it to theirs.
  const [view, setView] = useState<"full" | "plan">("full");
  const days = view === "plan" && plan ? plan.days : full;
  const index = Math.max(days.findIndex((d) => d.date === selected), 0);
  const current = days[index]!;
  const mine = current.mine ? MINE[current.mine] : null;
  const look = makeCategoryLook();
  // Spoken label for a dish's mark: the plan's own tag when it has one ("Veg"), else the plain diet.
  const diet = (d: MenuDay["groups"][number]["dishes"][number]) => legend.find((l) => l.color === d.color)?.label ?? (d.nonVeg ? "Non-veg" : "Veg");
  // Same wording and format as the trip card on Deliveries ("Changes until Thu 6:00 PM").
  const until = (ms: number) => new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: tz }).format(ms);
  // ISO dates sort in day order, so the swipe hook can tell which way the new day came from.
  const swipe = useSwipePages({ page: current.date, canPrev: index > 0, canNext: index < days.length - 1, step: (dir) => setSelected(days[index + dir]!.date) });

  return (
    <div className="flex flex-col gap-4">
      {(plan || legend.length > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          {plan && (
            <Segmented
              label="Dishes to show"
              idPrefix="menu-view"
              items={[{ id: "full", label: "Full menu" }, { id: "plan", label: plan.name }]}
              value={view}
              onChange={(v) => setView(v as "full" | "plan")}
              className="[&>button]:px-4"
            />
          )}
          {legend.length > 0 && (
            <ul aria-label="Diet marks" className="flex items-center gap-4 px-1">
              {legend.map((l) => (
                <li key={l.label} className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: l.color }}>
                  <DietMark color={l.color} />
                  {l.label}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex flex-col gap-5" {...(plan ? { role: "tabpanel", id: panelId("menu-view", view), "aria-labelledby": tabId("menu-view", view) } : {})}>
        <WeekBar days={days} value={index} today={today} onChange={(i) => setSelected(days[i]!.date)} />

        <div className="overflow-x-clip">
          <div ref={swipe.ref} {...swipe.bind} className="flex flex-col gap-5 [touch-action:pan-y]">
            <header className="flex flex-col gap-1 px-1">
              <p className="c-label">{DATE.format(at(current.date))}</p>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[28px] font-bold leading-tight tracking-[-0.03em]">{WEEKDAY.format(at(current.date))}</h2>
                {current.date === today && <Pill tone="brand" size="sm">Today</Pill>}
              </div>
              {!mine && <p className="c-caption">No delivery this day</p>}
            </header>

            {mine && (
              <div className="c-surface flex flex-wrap items-center gap-3 rounded-3xl bg-[var(--card)] p-4">
                <IconTile tint={mine.tint} size="lg"><mine.icon /></IconTile>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold">{mine.label}</p>
                  <p className="c-caption">{current.cutoffAt ? `Changes until ${until(current.cutoffAt)}` : mine.note}</p>
                </div>
                {mine.action && (
                  <Link
                    href={`/me?trip=${current.date}${mine.action === "Pick meals" ? "&action=pick" : ""}`}
                    className={buttonClass({ variant: mine.action === "Pick meals" ? "primary" : "outline", pill: true, className: "group w-full sm:w-auto" })}
                  >
                    {mine.action}
                    <ArrowRight aria-hidden className="size-4 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none" />
                  </Link>
                )}
              </div>
            )}

            {current.groups.length ? (
              // Keyed on the filter so switching it re-enters with one short fade; day changes slide via the swipe hook.
              // One card per dish, like the meal chips on Deliveries: the category's tile and name, then the dish.
              <ul
                key={view}
                aria-label="Dishes"
                className="grid grid-cols-2 gap-3 transition-[opacity,translate] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none sm:grid-cols-3 lg:grid-cols-4"
              >
                {current.groups.flatMap((g) => {
                  const { icon: Icon, tint } = look(g.key, g.icon);
                  return g.dishes.map((d) => (
                    <li key={`${g.key}:${d.name}`} className="c-surface flex flex-col gap-3 rounded-3xl bg-[var(--card)] p-4">
                      <div className="flex items-center justify-between gap-2">
                        <IconTile tint={tint}><Icon /></IconTile>
                        <DietMark color={d.color} />
                      </div>
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <p className="c-label uppercase">{g.label}</p>
                        <p className="text-[15px] font-semibold leading-snug">
                          {d.name}
                          <span className="sr-only">, {diet(d)}</span>
                        </p>
                      </div>
                    </li>
                  ));
                })}
              </ul>
            ) : (
              <EmptyState icon={<UtensilsCrossed className="size-6" />} title="Nothing cooking" body="The kitchen hasn't listed dishes for this day." className="py-8" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
