"use client";
import { ArrowDownLeft, ArrowUpRight, CalendarCheck, Check, House, Info, MapPin, Pencil, Truck } from "lucide-react";
import { Card, Pill, Sheet, StatusDot, type DeliveryStatus, type Tone } from "@/components/customer/kit";
import { cn, FONT, FOCUS } from "@/components/customer/kit/cn";
import { humanDate, type Trip } from "@/lib/deliveries-view";
import { deliveryLine, isDone, moveNotes, tiffinBreakdown, weekdayShort, type EatingRow } from "@/lib/deliveries-view/eating";
import type { PlanView } from "./adapter";
import type { SubscriptionAddon } from "@/lib/services/customer-deliveries.service";

const WD = new Intl.DateTimeFormat("en-CA", { weekday: "short", timeZone: "UTC" });
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
export const dayNum = (iso: string) => d(iso).getUTCDate();
export const weekday = (iso: string) => WD.format(d(iso));

export function statusMeta(t: Trip): { label: string; tone: Tone; dot: DeliveryStatus | null } {
  switch (t.status) {
    case "upcoming": return { label: t.isMakeup ? "Make-up" : "Upcoming", tone: "up", dot: "upcoming" };
    case "delivered": return { label: "Delivered", tone: "ok", dot: "delivered" };
    case "unconfirmed": return { label: "Awaiting confirmation", tone: "neutral", dot: "upcoming" };
    case "cutoff-passed": return { label: "Being prepared", tone: "ok", dot: "delivered" };
    case "rescheduled": return { label: "Moved", tone: "hold", dot: "hold" };
    case "locked": return { label: "Closed", tone: "neutral", dot: "hold" };
    case "vacation": return { label: "Vacation", tone: "vac", dot: "vacation" };
    case "combined-into": return { label: "Moved", tone: "neutral", dot: "combined" };
    case "failed": return { label: "Not delivered", tone: "hold", dot: "hold" };
  }
}

const MOVED_TRIP: Trip["status"][] = ["rescheduled", "combined-into"];

/** A moved-away eating day reads "Moved" even while its old trip keeps delivering other days. */
export function rowMeta(row: EatingRow): ReturnType<typeof statusMeta> {
  return row.movedTo && !MOVED_TRIP.includes(row.trip.status) ? { label: "Moved", tone: "neutral", dot: "combined" } : statusMeta(row.trip);
}

/** Card facts for a moved-away day: where its tiffin is eaten now, not the old trip's count. */
export const movedFact = (row: EatingRow): string => `${weekdayShort(row.date)}'s tiffin is eaten ${humanDate(row.movedTo!)} now, with that day's meal`;

export type PlanTagInfo = { color: string; label: string };
export function PlanTag({ plan }: { plan: PlanTagInfo }) {
  return (
    <span data-testid="plan-tag" className="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border border-[var(--border)] px-2 py-0.5 text-xs font-semibold text-[var(--foreground)]">
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: plan.color }} />
      <span className="truncate">{plan.label}</span>
    </span>
  );
}

export const tiffins = (n: number) => `${n} ${n === 1 ? "tiffin" : "tiffins"}`;

export function rowSubline(t: Trip, tz: string): string {
  if (t.status === "rescheduled" && t.movedTo) return `Moved to ${humanDate(t.movedTo)}`;
  if (t.status === "combined-into" && t.mergedInto) return `Combined into ${humanDate(t.mergedInto)}`;
  if (t.coversLabel) return t.coversLabel;
  if (t.isMakeup) return "Make-up delivery";
  return humanDate(t.date);
}

export function TripRow({ trip, tz, selected, onSelect, plan }: { trip: Trip; tz: string; selected: boolean; onSelect: (trip: Trip) => void; plan?: PlanTagInfo }) {
  const m = statusMeta(trip);
  return (
    <button
      type="button"
      data-testid="trip-row"
      aria-pressed={selected}
      aria-label={`${humanDate(trip.date)}${plan ? `, ${plan.label}` : ""}, ${m.label}`}
      onClick={() => onSelect(trip)}
      className={cn(
        FONT, FOCUS,
        "flex min-h-14 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors [touch-action:manipulation] motion-reduce:transition-none",
        selected ? "bg-[var(--muted)]" : "hover:bg-[var(--muted)]/60",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{humanDate(trip.date)}</span>
        <span className="block text-[13px] text-[var(--muted-foreground,#6E6558)]">{trip.status === "combined-into" ? rowSubline(trip, tz) : trip.coversLabel ?? tiffins(trip.units)}</span>
        {plan && <span className="mt-1 block"><PlanTag plan={plan} /></span>}
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-[var(--muted-foreground,#6E6558)]">
        {m.dot && <StatusDot decorative status={m.dot} />}
        {m.label}
      </span>
    </button>
  );
}

/** "Bhindi Masala, Bhindi Masala" -> "Bhindi Masala x2". */
export function dedupeDishes(summary: string | null): string[] {
  const counts = new Map<string, number>();
  for (const n of summary ? summary.split(", ") : []) counts.set(n, (counts.get(n) ?? 0) + 1);
  return [...counts].map(([n, c]) => (c > 1 ? `${n} ×${c}` : n));
}

/** Header + dishes only; the desktop card slots its actions in as children. */
export function TripCard({ trip, tz, reason, plan, children }: { trip: Trip; tz: string; reason: string | null; plan?: PlanTagInfo; children?: React.ReactNode }) {
  const m = statusMeta(trip);
  const multi = trip.eatingDays.length > 1;
  return (
    <Card className="p-5 lg:p-8" aria-live="polite">
      <p className="flex items-center gap-2 text-sm font-semibold text-[var(--muted-foreground,#6E6558)]">
        {m.dot && <StatusDot decorative status={m.dot} />}
        {m.label}
        {plan && <PlanTag plan={plan} />}
      </p>
      <h2 className="mt-1 text-[28px] font-bold leading-tight tracking-[-0.03em] lg:text-[34px]">{humanDate(trip.date)}</h2>
      <p className="mt-1 text-[15px] text-[var(--muted-foreground,#6E6558)]">
        {[trip.coversLabel, trip.status === "upcoming" ? null : reason].filter(Boolean).join(" · ") || tiffins(trip.units)}
      </p>
      {trip.status !== "combined-into" && (
        <ul className="mt-5 space-y-3 border-t border-[var(--border)] pt-5">
          {trip.eatingDays.map((e) => {
            const dishes = dedupeDishes(e.dishSummary);
            return (
              <li key={e.date} className="text-[15px]">
                {multi && <span className="mb-0.5 block text-[13px] font-semibold text-[var(--muted-foreground,#6E6558)]">{humanDate(e.date)}</span>}
                <span className="block">{dishes.length ? dishes.join(", ") : <span className="text-[var(--muted-foreground,#6E6558)]">Default menu</span>}</span>
              </li>
            );
          })}
        </ul>
      )}
      {children}
    </Card>
  );
}


/** Delivery card for the selected eating day: which truck feeds it, how many tiffins, when it locks. Dishes live in the list, not here. */
/** Trips that still physically go somewhere (not moved away or paused), so naming an address means something. */
const GOES_OUT = new Set<Trip["status"]>(["upcoming", "cutoff-passed", "unconfirmed", "delivered", "locked", "failed"]);

/** Where the tiffin is on its way to the door. No live tracking: the stage comes from the trip's status alone. */
// We don't know when the kitchen starts cooking, only that the cutoff passed — so no "Preparing" stop.
const STAGE: Partial<Record<Trip["status"], number>> = { upcoming: 0, "cutoff-passed": 0, locked: 0, unconfirmed: 1, delivered: 2 };
const STOPS = [
  { label: "Scheduled", Icon: CalendarCheck },
  { label: "On the way", Icon: Truck },
  { label: "Delivered", Icon: House },
] as const;

export function Journey({ status, caption }: { status: Trip["status"]; caption?: string | null }) {
  const at = STAGE[status];
  if (at == null) return null;
  const done = at === STOPS.length - 1;
  const tone = done ? "var(--s-delivered,#10b981)" : "var(--s-upcoming,#0ea5e9)";
  return (
    <div role="img" aria-label={`${STOPS[at]!.label} delivery`} data-testid="journey">
      <ol aria-hidden className="relative grid grid-cols-3">
        {/* Track runs centre-to-centre of the first and last stop; the filled part ends at the current stop. */}
        <span className="absolute left-[16.667%] right-[16.667%] top-5 h-[3px] -translate-y-1/2 rounded-full bg-[var(--border)]" />
        <span className="absolute left-[16.667%] top-5 h-[3px] -translate-y-1/2 rounded-full transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${at * 33.333}%`, background: tone }} />
        {STOPS.map(({ label, Icon }, i) => {
          const now = i === at;
          const past = i < at;
          return (
            <li key={label} className="relative flex flex-col items-center gap-1.5">
              <span
                className={cn("grid place-items-center rounded-full transition-colors", now ? "size-10 text-white shadow-md" : "mt-1 size-8 ring-[1.5px]", !now && !past && "bg-[var(--card)] text-[var(--muted-foreground,#6E6558)] ring-[var(--border)]")}
                style={now ? { background: tone } : past ? { background: "var(--card)", color: tone, ["--tw-ring-color" as string]: tone } : undefined}
              >
                {past ? <Check className="size-4" /> : <Icon className={now ? "size-5" : "size-4"} />}
              </span>
              <span className={cn("text-center text-[12px] leading-tight", now ? "font-bold" : "font-medium text-[var(--muted-foreground,#6E6558)]")} style={now ? { color: tone } : undefined}>{label}</span>
            </li>
          );
        })}
      </ol>
      {caption && <p className="mt-2 text-center text-[13px] text-[var(--muted-foreground,#6E6558)]">{caption}</p>}
    </div>
  );
}

// Only what the stops can't say: past the cutoff, nothing can change any more.
const JOURNEY_NOTE: Partial<Record<Trip["status"], string>> = { "cutoff-passed": "Changes closed", locked: "Changes closed" };

/** Dated in/out chips for a day: "In from Thu, Oct 8", "Out to Mon, Oct 12". Customer card and admin hub share them. */
export function moveChips(row: EatingRow, history = false): { kind: "in" | "out"; text: string }[] {
  if (row.movedTo) return [{ kind: "out", text: `Out to ${humanDate(row.movedTo)}` }];
  if (isDone(row) && !history) return [];
  return [
    ...(row.movedFrom ?? []).map((d) => ({ kind: "in" as const, text: d ? `In from ${humanDate(d)}` : "In from a held day" })),
    ...(row.movedOut ? [{ kind: "out" as const, text: `Out to ${humanDate(row.movedOut)}` }] : []),
  ];
}

export const cutoffFmt = (ms: number, tz: string) => new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: tz }).format(ms);

/** The selected eating day, as the page's main card: date, dishes, then one quiet line for tiffins, delivery day and cutoff. */
export function EatingCard({ row, tz, reason, plan, address, eyebrow, menuOut, onDetails, onEditAddress, meal, addonTiles, children }: { row: EatingRow; tz: string; reason: string | null; plan?: PlanTagInfo; address?: { text: string; changed: boolean } | null; eyebrow?: string | null; menuOut?: boolean; onDetails?: () => void; onEditAddress?: () => void; meal?: MealCategory[]; addonTiles?: MealCategory[]; children?: React.ReactNode }) {
  const { trip } = row;
  const m = rowMeta(row);
  const facts = row.movedTo ? []
    : trip.status === "failed" ? [`Not delivered. Move it to another day.`]
    : isDone(row) ? [reason] : [trip.status === "upcoming" ? null : reason];
  // Short in/out pills ("Thu's in", "to Oct 12") instead of sentences.
  const moves = moveChips(row);
  const arriving = !row.movedTo && GOES_OUT.has(trip.status) && trip.status !== "failed";
  const [first, ...rest] = dedupeDishes(row.dish);
  const tiffinCount = `${tiffins(trip.units)}${trip.units > 1 ? ` (${tiffinBreakdown(trip)})` : ""}`;
  const meta = arriving ? [
    // A day carried on another day's truck says which one.
    trip.date !== row.date ? `${trip.status === "delivered" ? "Delivered" : "Arrives"} ${humanDate(trip.date)} with ${weekdayShort(trip.date)}` : null,
    trip.status === "upcoming" && trip.cutoffAt ? `Changes until ${cutoffFmt(trip.cutoffAt, tz)}` : null,
  ].filter(Boolean).join(" · ") || null : null;
  const label = (text: string, color: string) => <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color }}>{text}</h3>;
  const MUTED = "var(--muted-foreground,#6E6558)";
  return (
    <section aria-live="polite" data-testid="delivery-block" className="space-y-9">
      {/* One question per block: delivery (blue), meal (warm), destination (neutral). Spacing separates them, not cards. */}
      <div>
        {label("Delivery", "var(--s-upcoming,#0ea5e9)")}
        <h2 className="text-[28px] font-bold leading-tight tracking-[-0.03em] lg:text-[34px]">{humanDate(row.date)}</h2>
        {meta && <p className="mt-1 text-[14px] tabular-nums text-[var(--muted-foreground,#6E6558)]" data-testid="delivery-pills">{meta}</p>}
        {plan && <span className="mt-1 inline-block"><PlanTag plan={plan} /></span>}
        {!row.movedTo && STAGE[trip.status] != null ? <div className="mt-6"><Journey status={trip.status} caption={JOURNEY_NOTE[trip.status]} /></div> : (
          <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-[var(--muted-foreground,#6E6558)]">
            {m.dot && <StatusDot decorative status={m.dot} />}
            {eyebrow ?? m.label}
          </p>
        )}
        {moves.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2" data-testid="move-pills">
            {moves.map((f) => {
              const Icon = f.kind === "in" ? ArrowDownLeft : ArrowUpRight;
              return (
                <Pill key={f.text} tone={f.kind === "in" ? "brand" : "soft"} icon={<Icon aria-hidden className="size-4 shrink-0" />} className="h-9 px-3.5 text-[13px]">
                  {f.text}
                </Pill>
              );
            })}
          </div>
        )}
        {facts.length > 0 && (
          <ul className="mt-3 space-y-1 text-[14px] text-[var(--muted-foreground,#6E6558)]">
            {facts.map((f) => <li key={f}>{f}</li>)}
          </ul>
        )}
      </div>

      {!row.movedTo && (
        <div>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--primary)]">Your meal</h3>
            {onDetails && (
              <button type="button" onClick={onDetails} aria-label={`Details for ${humanDate(row.date)}`} className={cn(FOCUS, "-my-3 grid size-11 place-items-center rounded-full text-[var(--muted-foreground,#6E6558)] [touch-action:manipulation]")}>
                <Info aria-hidden className="size-4" />
              </button>
            )}
          </div>
          {menuOut ? <p className="text-[15px] text-[var(--muted-foreground,#6E6558)]">Menu not released yet</p> : meal && meal.length > 0 ? (
            <>
              <MealTiles cats={meal} />
              {addonTiles && addonTiles.length > 0 && (
                <>
                  <h4 className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground,#6E6558)]">Add-ons</h4>
                  <MealTiles cats={addonTiles} />
                </>
              )}
            </>
          ) : (
            <>
              {/* One dish per line: the main dish leads, the rest follow quieter. */}
              <ul className="space-y-0.5">
                <li className="text-[17px] font-semibold leading-snug">{first ?? "Default menu"}</li>
                {rest.map((d) => <li key={d} className="text-[15px] text-[var(--muted-foreground,#6E6558)]">{d}</li>)}
              </ul>
            </>
          )}
          {arriving && <p className="mt-2 text-[14px] text-[var(--muted-foreground,#6E6558)]">{tiffinCount}</p>}
        </div>
      )}

      {address && !row.movedTo && GOES_OUT.has(trip.status) && (
        <div>
          {label("Destination", MUTED)}
          <p className="flex items-center gap-2 text-[15px]" data-testid="delivery-address">
            <MapPin aria-hidden className="size-4 shrink-0 text-[var(--muted-foreground,#6E6558)]" />
            <span className="min-w-0 flex-1 truncate">{address.text}{address.changed ? " (this delivery only)" : ""}</span>
            {onEditAddress && (
              <button type="button" onClick={onEditAddress} aria-label="Change address" className={cn(FOCUS, "inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-semibold text-[var(--primary)] [touch-action:manipulation]")}>
                <Pencil aria-hidden className="size-3.5" />
                Edit
              </button>
            )}
          </p>
        </div>
      )}

      {children}
    </section>
  );
}

export const EXPLAIN: Record<Trip["status"], string> = {
  upcoming: "Scheduled. Changes open until cutoff.",
  delivered: "This delivery has been made.",
  unconfirmed: "Out for delivery.",
  "cutoff-passed": "Being prepared. Can't be changed.",
  rescheduled: "Moved to another day.",
  locked: "Closed for changes.",
  vacation: "Paused. Move it to another day.",
  "combined-into": "Combined into another delivery.",
  failed: "Not delivered. Move it to another day.",
};

/** Meal breakdown of one eating day (category, portion after swaps, dishes), with a compact delivery footer. */
export type MealCategory = { category: string; label: string; items: { name: string; portion: string | null }[] };
type MealPlan = Pick<PlanView, "days" | "portionsByDate" | "categoryPortionSlots" | "categoryPortions">;

/** This eating day's meal by category, each pick with its portion (swaps first, then per-slot, then the category's). */
export function mealCategories(row: EatingRow, plan: MealPlan): MealCategory[] {
  const source = plan.days.find((d) => d.date === row.trip.date);
  const meal = row.own ? source?.meal : source?.carriedMeals?.[row.date];
  const portion = (category: string, i: number): string | null => {
    const swapped = plan.portionsByDate?.[row.date]?.[category];
    if (swapped?.length) return swapped[i] ?? swapped[swapped.length - 1] ?? null;
    const slots = plan.categoryPortionSlots?.[category];
    if (slots?.length) return slots[i] ?? slots[slots.length - 1] ?? null;
    return plan.categoryPortions[category] ?? null;
  };
  return (meal ?? []).filter((c) => c.picks.length > 0).map((c) => ({
    category: c.category,
    label: c.label,
    items: c.picks.map((p, i) => ({ name: p.name, portion: portion(c.category, i) })),
  }));
}

/**
 * The day's meal cut in two: the meal's own tiles, and its add-ons'. A row add-on (extra sabzi) is
 * the category's last pick(s); a folded one (extra roti) is a separate line with its own total.
 */
export function splitMealAddons(cats: MealCategory[], addons: SubscriptionAddon[] = []): { meal: MealCategory[]; addons: MealCategory[] } {
  const meal = cats.map((c) => ({ ...c, items: [...c.items] }));
  const extra = new Map<string, MealCategory>();
  for (const a of addons) {
    const own = meal.find((c) => c.category === a.category);
    const tile = extra.get(a.category) ?? { category: a.category, label: own?.label ?? a.name, items: [] };
    if (a.folded) tile.items.push({ name: own?.items[0]?.name ?? a.name, portion: a.portion });
    else if (own) tile.items.push(...own.items.splice(Math.max(0, own.items.length - a.qty)));
    if (tile.items.length) extra.set(a.category, tile);
  }
  return { meal: meal.filter((c) => c.items.length > 0), addons: [...extra.values()] };
}

/**
 * One tile per item the customer gets: two sabzis are two tiles ("Sabzi · 12oz", "Sabzi · 8oz").
 * Kitchen counts group by category for totals; a customer reads their own tiffin item by item.
 */
export function MealTiles({ cats }: { cats: MealCategory[] }) {
  const tiles = cats.flatMap((c) => c.items.map((it, i) => ({ key: `${c.category}:${i}`, label: c.label, ...it })));
  return (
    <ul aria-label="Meal" className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="meal-tiles">
      {tiles.map((t) => (
        <li key={t.key} className="min-w-0 rounded-xl bg-[var(--muted)]/60 px-3 py-2">
          <p className="truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--muted-foreground,#6E6558)]">
            {t.label}{t.portion ? ` · ${t.portion}` : ""}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[14px] font-semibold leading-snug">{t.name}</p>
        </li>
      ))}
    </ul>
  );
}

export function TripInfoSheet({ row, tz, plan, open, onClose }: { row: EatingRow; tz: string; plan?: PlanView; open: boolean; onClose: () => void }) {
  const t = row.trip;
  const cats = plan ? mealCategories(row, plan) : [];
  const delivery = row.movedTo ? [deliveryLine(row), movedFact(row)].join(" · ") : [
    deliveryLine(row),
    `${tiffins(t.units)} covering ${t.coversDates.map(weekdayShort).join(" + ")}`,
    ...moveNotes(row),
  ].filter(Boolean).join(" · ");
  return (
    <Sheet open={open} onClose={onClose} title={`${humanDate(row.date)} · your meal`}>
      <div className="space-y-4 pb-2 text-[15px]">
        {cats.length > 0 ? (
          <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]" aria-label="Meal">
            {cats.map((c) => (
              <li key={c.category} className="px-4 py-3">
                <span className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground,#6E6558)]">{c.label}</span>
                {c.items.map((p, i) => (
                  <span key={`${p.name}-${i}`} className="mt-0.5 block font-semibold">
                    {p.name}
                    {p.portion ? <span className="font-normal text-[var(--muted-foreground,#6E6558)]"> · {p.portion}</span> : null}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        ) : (
          <p>{dedupeDishes(row.dish).join(", ") || "Default menu. Dishes show once the menu is out."}</p>
        )}
        <p className="flex items-start gap-2 text-[13px] text-[var(--muted-foreground,#6E6558)]" data-testid="info-delivery">
          <Truck aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{delivery}</span>
        </p>
      </div>
    </Sheet>
  );
}

