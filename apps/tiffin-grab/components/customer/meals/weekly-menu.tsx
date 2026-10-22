"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, UtensilsCrossed } from "lucide-react";
import { Card, DateStrip, EmptyState, Pill, Segmented, panelId, tabId, type StripDay, type Tone } from "@/components/customer/kit";
import { buttonClass } from "@/components/customer/kit/button-class";
import { useTimezone } from "@/components/providers/timezone-provider";
import type { MenuDay, MyDay } from "@/lib/menu/customer-week";

const LONG = new Intl.DateTimeFormat("en-CA", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
const day = (iso: string) => LONG.format(new Date(`${iso}T00:00:00Z`));

const STRIP: Partial<Record<NonNullable<MyDay>, StripDay["status"]>> = { delivered: "delivered", paused: "paused", hold: "hold" };

// What this customer has on the selected day, and the one thing they can do about it.
const MINE: Record<NonNullable<MyDay>, { tone: Tone; label: string; note: string; action?: "Pick meals" | "View delivery" }> = {
  pick: { tone: "wash", label: "Your delivery", note: "Choose from these dishes before the cutoff.", action: "Pick meals" },
  locked: { tone: "neutral", label: "Your delivery", note: "Past the cutoff, so this day's meals are set.", action: "View delivery" },
  delivered: { tone: "ok", label: "Delivered", note: "This day has been delivered." },
  paused: { tone: "vac", label: "Paused", note: "You paused this day.", action: "View delivery" },
  hold: { tone: "hold", label: "On hold", note: "This day is on hold.", action: "View delivery" },
};

/** The square-and-dot food mark Indian menus use; brown for non-veg. Shape plus label, never colour alone. */
function NonVegMark() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#8A3B12] dark:text-[#F0A27A]">
      <span aria-hidden className="grid size-3.5 place-items-center rounded-[3px] border-[1.5px] border-current">
        <span className="size-1.5 rounded-full bg-current" />
      </span>
      Non-veg
    </span>
  );
}

/** The released week: a day strip marked with this customer's delivery days, and the chosen day's dishes. */
export function WeeklyMenu({ days: full, plan, initial, today }: { days: MenuDay[]; plan: { name: string; days: MenuDay[] } | null; initial: string; today: string }) {
  const tz = useTimezone();
  const [selected, setSelected] = useState(initial);
  // Everyone sees what the kitchen makes; a customer on one plan can narrow it to theirs.
  const [view, setView] = useState<"full" | "plan">("full");
  const days = view === "plan" && plan ? plan.days : full;
  // Same wording and format as the trip card on Deliveries ("Changes until Thu 6:00 PM").
  const until = (ms: number) => new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: tz }).format(ms);
  const current = days.find((d) => d.date === selected) ?? days[0]!;
  const mine = current.mine ? MINE[current.mine] : null;

  const strip: StripDay[] = days.map((d) => ({
    date: d.date,
    status: d.mine ? STRIP[d.mine] : undefined,
    delivery: d.mine === "pick" || d.mine === "locked",
  }));

  return (
    <div className="flex flex-col gap-4">
      {plan && (
        <Segmented
          label="Dishes to show"
          idPrefix="menu-view"
          items={[{ id: "full", label: "Full menu" }, { id: "plan", label: plan.name }]}
          value={view}
          onChange={(v) => setView(v as "full" | "plan")}
          className="self-start [&>button]:px-4"
        />
      )}
      <div className="flex flex-col gap-4" {...(plan ? { role: "tabpanel", id: panelId("menu-view", view), "aria-labelledby": tabId("menu-view", view) } : {})}>
        <DateStrip label="Day" days={strip} value={selected} onChange={setSelected} fit />

        <Card className="flex flex-col gap-5 p-5 lg:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="c-h2">{day(current.date)}</h2>
              <div className="flex flex-wrap items-center gap-2">
                {current.date === today && <Pill tone="brand" size="sm">Today</Pill>}
                {mine ? <Pill tone={mine.tone} size="sm">{mine.label}</Pill> : <span className="c-caption">No delivery this day</span>}
              </div>
              {mine && <p className="c-caption">{current.cutoffAt ? `Changes until ${until(current.cutoffAt)}` : mine.note}</p>}
            </div>
            {mine?.action && (
              <Link
                href={`/me?trip=${current.date}${mine.action === "Pick meals" ? "&action=pick" : ""}`}
                className={buttonClass({ variant: mine.action === "Pick meals" ? "primary" : "outline", pill: true, className: "group" })}
              >
                {mine.action}
                <ArrowRight aria-hidden className="size-4 transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none" />
              </Link>
            )}
          </div>

          {current.groups.length ? (
            // Keyed so a new day or filter re-enters with one short fade; nothing moves under reduced motion.
            <dl
              key={`${view}:${current.date}`}
              className="grid gap-x-8 gap-y-5 border-t border-[var(--border)] pt-5 transition-[opacity,translate] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] starting:translate-y-1 starting:opacity-0 motion-reduce:transition-none sm:grid-cols-2 lg:grid-cols-3"
            >
              {current.groups.map((g) => (
                <div key={g.label} className="flex flex-col gap-1.5">
                  <dt className="c-eyebrow">{g.label}</dt>
                  {g.dishes.map((d) => (
                    <dd key={d.name} className="flex items-center gap-2 text-[16px] font-medium leading-snug">
                      {d.name}
                      {d.nonVeg && <NonVegMark />}
                    </dd>
                  ))}
                </div>
              ))}
            </dl>
          ) : (
            <EmptyState icon={<UtensilsCrossed className="size-6" />} title="Nothing cooking" body="The kitchen hasn't listed dishes for this day." className="py-8" />
          )}
        </Card>
      </div>
    </div>
  );
}
