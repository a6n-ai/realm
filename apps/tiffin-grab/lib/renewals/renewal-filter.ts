// The Renewals filters over plan facts, in JS: the same rules renewalsWhere used to build as SQL.
import { and, like, matches, or, type Condition } from "@foundry/commons";
import { addDaysIso } from "@foundry/commons/util/dates";
import { UNASSIGNED_OWNER } from "@/lib/list/presets";
import type { RenewalRange, RenewalsFilter, TrackFilter } from "./filters";
import type { PlanFact } from "./renewal-facts";
import type { DayBounds } from "./renewals.service";

const RUNNING = new Set(["active", "paused"]);
const RUNNING_OR_DONE = new Set(["active", "paused", "completed"]);
const CLOSED_TRACK = new Set(["renewed", "not_renewed"]);

/** `ownerId`: the resolved id when `f.owner` is a publicId (null when it matched no one). */
export type FilterContext = { today: string; range: RenewalRange; day: DayBounds; ownerId: bigint | null };

const between = (v: string | null, from: string, to: string) => v != null && v >= from && v <= to;

/** Running plans whose last tiffin is today through `days` out. */
const ending = (p: PlanFact, today: string, days: number) => RUNNING.has(p.status) && between(p.last, today, addDaysIso(today, days));
/** Plans whose last tiffin was in the last `days` days. */
const ended = (p: PlanFact, today: string, days: number) => RUNNING_OR_DONE.has(p.status) && between(p.last, addDaysIso(today, -days), addDaysIso(today, -1));
/** To renew: nothing booked after, and ending within 7 days or lapsed within 14. */
const renewWindow = (p: PlanFact, today: string) => p.renewal === "none" && (ending(p, today, 7) || ended(p, today, 14));

function inRange(p: PlanFact, r: RenewalRange): boolean {
  if (r.by === "renewed") return p.laterBookedAtFirst != null && (r.fromMs == null || p.laterBookedAtFirst >= r.fromMs) && (r.toMs == null || p.laterBookedAtFirst <= r.toMs);
  if (r.by === "ordered") return (r.fromMs == null || p.createdAt >= r.fromMs) && (r.toMs == null || p.createdAt <= r.toMs);
  if (r.by === "running") return (!r.toIso || p.startDate <= r.toIso) && (!r.fromIso || (p.last != null && p.last >= r.fromIso));
  return (!r.fromIso || (p.last != null && p.last >= r.fromIso)) && (!r.toIso || (p.last != null && p.last <= r.toIso));
}

/** Follow-ups only show on plans whose track is still open. */
function followUp(p: PlanFact, kind: "due" | "overdue" | "upcoming" | "none", day: DayBounds): boolean {
  if (p.track != null && CLOSED_TRACK.has(p.track)) return false;
  const at = p.trackFollowUpAt;
  if (kind === "none") return at == null;
  if (at == null) return false;
  return kind === "due" ? at >= day.dayStart && at < day.dayEnd : kind === "overdue" ? at < day.dayStart : at >= day.dayEnd;
}

function statusOk(p: PlanFact, f: RenewalsFilter, today: string): boolean {
  if (!f.status) return true;
  if (f.status === "not_renewed") return p.renewal === "none" && p.last != null && p.last >= today;
  if (f.status === "lapsed") return p.renewal === "none" && p.last != null && p.last < today;
  if (f.status === "booked_unpaid") return p.renewal === "unpaid" || p.renewal === "waitlisted";
  return p.renewal === f.status;
}

const trackOk = (p: PlanFact, track: readonly TrackFilter[] | null) =>
  !track || (p.track == null ? track.includes("new") : track.includes(p.track));

/** Every word must hit the name, order code or phone, in any order (same rule as the other list searches). */
export function searchCondition(q: string): Condition | undefined {
  const words = q.split(" ").filter(Boolean);
  if (!words.length) return undefined;
  return and(...words.map((w) => or(like("fullName", `%${w}%`), like("deploymentId", `%${w}%`), like("phone", `%${w}%`))));
}

/**
 * Due / overdue / upcoming and To renew are their own lists: the top date range and the Ending / Ended windows
 * do not narrow them. "none" (no follow-up) is a plain filter on the range and windows, like any other.
 * Org visibility is applied by the caller.
 */
export function renewalMatches(f: RenewalsFilter, ctx: FilterContext): (p: PlanFact) => boolean {
  const { today, range, day } = ctx;
  const dayView = f.followUp && f.followUp !== "none" ? f.followUp : null;
  const search = searchCondition(f.q);
  return (p) => {
    if (f.type === "trial" ? !p.trial : f.type === "regular" ? p.trial : false) return false;
    if (!RUNNING_OR_DONE.has(p.status)) return false;
    if (dayView) {
      if (!followUp(p, dayView, day)) return false;
    } else if (f.renewWindow) {
      if (!renewWindow(p, today)) return false;
    } else {
      if (!inRange(p, range)) return false;
      if ((f.ending != null || f.ended != null) && !((f.ending != null && ending(p, today, f.ending)) || (f.ended != null && ended(p, today, f.ended)))) return false;
    }
    if (f.followUp === "none" && !followUp(p, "none", day)) return false;
    if (!statusOk(p, f, today) || !trackOk(p, f.track)) return false;
    if (f.owner) {
      if (f.owner === UNASSIGNED_OWNER ? p.currentOwner != null : ctx.ownerId == null || p.currentOwner !== ctx.ownerId) return false;
    }
    return !search || matches(p, search);
  };
}

/** Upcoming endings first, soonest on top; then lapsed plans, most recent first; then order id (as the SQL list sorted). */
export function renewalOrder(today: string) {
  const group = (p: PlanFact) => (p.last == null ? 2 : p.last < today ? 1 : 0);
  return (a: PlanFact, b: PlanFact): number => {
    const g = group(a) - group(b);
    if (g) return g;
    if (a.last != null && b.last != null && a.last !== b.last) return group(a) === 0 ? (a.last < b.last ? -1 : 1) : a.last > b.last ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}
