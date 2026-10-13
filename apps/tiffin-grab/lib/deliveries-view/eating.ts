import { humanDate, type Trip, type TripStatus } from "./index";

/** The customer's unit of thought: one eating day, fed by the trip (delivery day) that carries it. */
export type EatingRow = {
  orderId: string;
  date: string;
  trip: Trip;
  dish: string | null;
  swaps: string[];
  /** True when this is the delivery day itself (the truck arrives today). */
  own: boolean;
  /** This day's tiffin was moved away: it is now eaten on this date. */
  movedTo?: string;
  /** Eat dates of tiffins moved onto this day (null = from the pool); they share this day's meal. */
  movedFrom?: (string | null)[];
  /** This day's own tiffin moved away, but the day still gets a tiffin (one moved in): where its own went. */
  movedOut?: string;
};

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const weekdayShort = (iso: string) => WD[new Date(`${iso}T00:00:00Z`).getUTCDay()]!;

/**
 * Eating days of the given trips, in date order. Merged-source trips add nothing: their day is in
 * the target's covers. A day whose only tiffin was moved away stays listed as "Moved to <day>".
 */
export function buildEatingDays(trips: Trip[]): EatingRow[] {
  const rows: EatingRow[] = [];
  const covered = new Set(trips.filter((t) => t.status !== "combined-into").flatMap((t) => t.coversDates));
  for (const trip of trips) {
    const moved = trip.status === "rescheduled" || trip.status === "combined-into";
    const outTo = new Map((trip.movesOut ?? []).flatMap((m) => (m.from ? [[m.from, m.to] as const] : [])));
    for (const e of trip.eatingDays) {
      // A merged source shows only the days its target does not already carry: those read "Moved to ...".
      if (trip.status === "combined-into" && covered.has(e.date)) continue;
      const movedFrom = (trip.movesIn ?? []).filter((m) => m.to === e.date).map((m) => m.from);
      rows.push({
        orderId: trip.orderId, date: e.date, trip, dish: moved ? null : e.dishSummary, swaps: moved ? [] : e.swaps, own: e.date === trip.date,
        ...(moved ? { movedTo: outTo.get(e.date) ?? trip.movedTo ?? undefined } : {}),
        ...(movedFrom.length && !moved ? { movedFrom } : {}),
        ...(!moved && outTo.has(e.date) ? { movedOut: outTo.get(e.date) } : {}),
      });
    }
    if (moved) continue;
    for (const [from, to] of outTo) {
      if (covered.has(from)) continue;
      rows.push({ orderId: trip.orderId, date: from, trip, dish: null, swaps: [], own: from === trip.date, movedTo: to });
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The row that carries its truck's "Change address": the delivery day itself (even when its own
 * tiffin moved away, since the truck still goes), else the truck's first eating day when its own
 * date isn't an eating day. Address belongs to the delivery, which never moves.
 */
export function isAddressRow(rows: EatingRow[], row: EatingRow): boolean {
  // By trip + date, not object identity: callers pass rows from separate buildEatingDays runs.
  const own = rows.filter((r) => r.trip === row.trip);
  const anchor = own.find((r) => r.date === row.trip.date) ?? own[0];
  return anchor?.date === row.date;
}

const ARRIVING: TripStatus[] = ["upcoming", "delivered", "unconfirmed", "cutoff-passed", "locked"];

/**
 * Eating rows for one calendar week. A moved tiffin keeps its original eat date and
 * the truck moves, so a row whose eat date is last week still belongs in the week
 * the truck arrives — otherwise that delivery day reads as nothing planned.
 */
export function eatingRowsInWeek(trips: Trip[], weekStart: string, weekEnd: string): EatingRow[] {
  return buildEatingDays(trips).filter((r) => {
    if (r.date >= weekStart && r.date <= weekEnd) return true;
    if (r.movedTo) return false;
    return ARRIVING.includes(r.trip.status) && r.trip.date >= weekStart && r.trip.date <= weekEnd;
  });
}

/** Delivered or failed: the day is settled, so it reads as just that, without how it got there. */
export const isDone = (r: EatingRow): boolean => r.trip.status === "delivered" || r.trip.status === "failed";

/**
 * "Fri's tiffin moved here, same meal" for a day carrying moved-in tiffins; null otherwise.
 * `history`: keep it on delivered/failed days too (staff want to see how a day got there).
 */
export function movedInNote(r: EatingRow, history = false): string | null {
  if (!r.movedFrom?.length || (isDone(r) && !history)) return null;
  const names = r.movedFrom.map((d) => (d ? `${weekdayShort(d)}'s` : "a held day's"));
  return `${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)} tiffins` : `${names[0]} tiffin`} moved here, same meal`;
}

/** "Thu's own tiffin moved to Tue, Oct 13" when a day's own tiffin left but another moved in. */
export function movedOutNote(r: EatingRow, history = false): string | null {
  if (!r.movedOut || (isDone(r) && !history)) return null;
  return `${weekdayShort(r.date)}'s own tiffin moved to ${humanDate(r.movedOut)}`;
}

export type MoveFact = { kind: "in" | "out"; text: string };

/**
 * What this truck carries, by day: "1 Mon + 1 Tue", or "1 Thu + 1 Wed's" when a tiffin moved in.
 * Own tiffins split evenly over the days it covers; moved-in ones are named by the day they left.
 */
export function tiffinBreakdown(trip: Pick<Trip, "units" | "coversDates" | "movesIn">): string {
  const moved = new Map<string, number>();
  for (const m of trip.movesIn ?? []) {
    const k = m.from ? `${weekdayShort(m.from)}'s` : "held day's";
    moved.set(k, (moved.get(k) ?? 0) + 1);
  }
  const own = trip.units - [...moved.values()].reduce((a, b) => a + b, 0);
  const covers = trip.coversDates.length ? trip.coversDates : [];
  const parts: string[] = [];
  if (own > 0) {
    if (covers.length > 1 && own % covers.length === 0) parts.push(...covers.map((d) => `${own / covers.length} ${weekdayShort(d)}`));
    else parts.push(`${own} ${covers.map(weekdayShort).join(" + ")}`.trim());
  }
  for (const [k, n] of moved) parts.push(`${n} ${k}`);
  return parts.join(" + ");
}

/** Short list-row tags: "Wed's in", "own → Oct 13". Empty when nothing moved on this day. */
export function moveTags(r: EatingRow): MoveFact[] {
  const tags: MoveFact[] = [];
  if (r.movedFrom?.length) tags.push({ kind: "in", text: `${r.movedFrom.map((d) => (d ? `${weekdayShort(d)}'s` : "held day")).join(" + ")} in` });
  if (r.movedOut) tags.push({ kind: "out", text: `to ${humanDate(r.movedOut).slice(5)}` });
  return tags;
}

/** Everything that moved in and out of this day, in that order. Same wording for staff and customer. */
export function moveFacts(r: EatingRow, history = false): MoveFact[] {
  const inNote = movedInNote(r, history);
  const outNote = movedOutNote(r, history);
  return [...(inNote ? [{ kind: "in" as const, text: inNote }] : []), ...(outNote ? [{ kind: "out" as const, text: outNote }] : [])];
}

export function moveNotes(r: EatingRow, history = false): string[] {
  return moveFacts(r, history).map((f) => f.text);
}

/** "Arrives Mon, Sep 21" / "Comes with the Fri, Sep 25 delivery" / "Delivered Mon, Sep 21" / "Moved to Wed, Sep 23": which truck feeds this eating day. */
export function deliveryLine(r: EatingRow): string {
  if (r.movedTo) return `Moved to ${humanDate(r.movedTo)}`;
  const t = r.trip;
  const day = humanDate(t.date);
  // A day eaten off another day's truck names that delivery instead of claiming it arrives that day.
  const arrives = r.own ? `arrives ${day}` : `comes with the ${day} delivery`;
  const Arrives = arrives[0]!.toUpperCase() + arrives.slice(1);
  switch (t.status) {
    case "delivered": return `Delivered ${day}`;
    case "unconfirmed": return `Awaiting confirmation, ${day}`;
    case "failed": return `Delivery failed ${day}`;
    case "cutoff-passed": return `Being prepared, ${arrives}`;
    case "upcoming": return Arrives;
    case "rescheduled": case "combined-into": return t.movedTo ? `Moved to ${humanDate(t.movedTo)}` : "Moved";
    case "vacation": return "Paused";
    default: return Arrives;
  }
}
