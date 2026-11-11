// No "use client" and no db: the server page parses with it and builds the facet spec from the options.
import { zonedDateIso } from "@foundry/commons";
import type { RenewalStatus } from "@/lib/orders/queries";
import type { RenewalRange } from "@/lib/services/renewals.service";
import { TRACK_STATUSES, type TrackStatus } from "@/lib/renewals/status";

/** Plans (regular and trial, narrowed by `type`), or every customer who has renewed. */
export type RenewalsTab = "renewals" | "customers";

/** "Ending within N days" choices; 0 is today only. */
export const ENDING_DAYS = [0, 1, 2, 3, 7] as const;
/** "Ended in the last N days" choices: plans whose last tiffin has passed. */
export const ENDED_DAYS = [7, 14, 30, 60, 90] as const;
/** Renewed customers tab: "Renewed in the last N days" choices. */
export const RENEWED_DAYS = [7, 14, 30, 90] as const;
/** The Renewal facet: the computed renewal status, with "none" split by whether the plan is still running. */
export type RenewalStatusFilter = Exclude<RenewalStatus, "none"> | "not_renewed" | "lapsed" | "booked_unpaid";
/** Pills. `booked_unpaid` is the KPI drill (unpaid + waitlisted) and is not a pill. */
export const RENEWAL_STATUSES: readonly Exclude<RenewalStatusFilter, "booked_unpaid">[] = ["renewed", "unpaid", "waitlisted", "not_renewed", "lapsed"];

export const PLAN_TYPES = ["regular", "trial"] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

/** The Status facet: a staff track status, or "new" for plans nobody has touched. */
export type TrackFilter = TrackStatus | "new";
export const TRACK_FILTERS: readonly TrackFilter[] = [...TRACK_STATUSES, "new"];

export const FOLLOW_UP_KINDS = ["due", "overdue", "upcoming", "none"] as const;
export type FollowUpKind = (typeof FOLLOW_UP_KINDS)[number];
/** Open = not closed, a plan nobody has touched included. */
export const OPEN_TRACKS: readonly TrackFilter[] = ["new", "unresponsive", "expected", "follow_up", "pending_payment"];
export const CLOSED_TRACKS: readonly TrackFilter[] = ["renewed", "not_renewed"];
/** The Inquiries Renewals queues: To renew (the default), the three follow-up lists, or the Open and Closed staff statuses. */
export const RENEWAL_QUEUES = ["renew", "due", "overdue", "upcoming", "open", "closed"] as const;
export type RenewalQueue = (typeof RENEWAL_QUEUES)[number];
export function renewalQueueFilter(queue: RenewalQueue): Pick<RenewalsFilter, "followUp" | "track" | "renewWindow"> {
  if (queue === "renew") return { followUp: null, track: OPEN_TRACKS, renewWindow: true };
  if (queue === "open") return { followUp: null, track: OPEN_TRACKS, renewWindow: false };
  if (queue === "closed") return { followUp: null, track: CLOSED_TRACKS, renewWindow: false };
  return { followUp: queue, track: null, renewWindow: false };
}

/**
 * What the top date range filters on: the plan's last tiffin (default), its order date, any delivery
 * in range, or when the customer booked the next plan (renewal date).
 */
export type DateBy = "last" | "ordered" | "running" | "renewed";
export const DATE_BY: readonly { value: DateBy; label: string }[] = [
  { value: "last", label: "Last tiffin in range" },
  { value: "ordered", label: "Ordered in range" },
  { value: "running", label: "Running in range" },
  { value: "renewed", label: "Next plan booked in range" },
];

/**
 * `from`/`to`: the top date range, epoch ms (the page fills this month when absent). On the plan tab
 * `dateBy` says which date it filters; on the customers tab it is the renewal's order date.
 * `type`, `track` and `followUp` narrow the plan tab only.
 */
export type RenewalsFilter = {
  tab: RenewalsTab;
  type: PlanType | null;
  track: readonly TrackFilter[] | null;
  followUp: FollowUpKind | null;
  dateBy: DateBy;
  ending: number | null;
  ended: number | null;
  status: RenewalStatusFilter | null;
  renewed: number | null;
  /** Order owner's user publicId, UNASSIGNED_OWNER, or ME; plan tab only. */
  owner?: string | null;
  /** The To renew queue: ignores the top range and matches its own window. Set by renewalQueueFilter only. */
  renewWindow?: boolean;
  from: number | null;
  to: number | null;
  q: string;
};

const pick = (v: string | undefined, allowed: readonly number[]) => {
  const n = Number(v);
  return v != null && v !== "" && allowed.includes(n) ? n : null;
};

const pickOne = <T extends string>(v: string | undefined, allowed: readonly T[]): T | null => allowed.find((a) => a === v) ?? null;

const pickMany = <T extends string>(v: string | undefined, allowed: readonly T[]): T[] | null => {
  const list = [...new Set((v ?? "").split(",").map((s) => s.trim()).filter((s): s is T => allowed.includes(s as T)))];
  return list.length ? list : null;
};

const ms = (v: string | undefined) => (v && Number.isFinite(Number(v)) ? Number(v) : null);

/** `?type=`, `?track=`, `?followUp=`, `?dateBy=`, `?from=&to=`, `?ending=<days>`, `?ended=<days>`, `?status=`, `?renewed=<days>`, `?owner=`, `?q=`. */
export function parseRenewalsFilter(sp: Record<string, string | undefined>): RenewalsFilter {
  const tab: RenewalsTab = sp.tab === "customers" ? "customers" : "renewals";
  const dateBy = DATE_BY.find((d) => d.value === sp.dateBy)?.value ?? "last";
  const q = sp.q?.trim().replace(/\s+/g, " ") ?? "";
  const from = ms(sp.from);
  const to = ms(sp.to);
  if (tab === "customers") {
    return { tab, type: null, track: null, followUp: null, dateBy, ending: null, ended: null, status: null, renewed: pick(sp.renewed, RENEWED_DAYS), from, to, q };
  }
  // Renewals lists regular plans; Trial conversion (?tab=trials) is the trial type. Both are plan types, not tabs.
  const type = sp.tab === "trials" ? "trial" : (pickOne(sp.type, PLAN_TYPES) ?? "regular");
  const status = sp.status === "booked_unpaid" ? "booked_unpaid" : RENEWAL_STATUSES.find((s) => s === sp.status) ?? null;
  return {
    tab,
    type,
    track: pickMany(sp.track, TRACK_FILTERS),
    followUp: pickOne(sp.followUp, FOLLOW_UP_KINDS),
    dateBy,
    ending: pick(sp.ending, ENDING_DAYS),
    ended: pick(sp.ended, ENDED_DAYS),
    status,
    renewed: null,
    owner: sp.owner || undefined,
    from,
    to,
    q,
  };
}

export function renewalsQuery(f: RenewalsFilter): string {
  const sp = new URLSearchParams();
  if (f.tab !== "renewals") sp.set("tab", f.tab);
  if (f.type) sp.set("type", f.type);
  if (f.track?.length) sp.set("track", f.track.join(","));
  if (f.followUp) sp.set("followUp", f.followUp);
  if (f.dateBy !== "last") sp.set("dateBy", f.dateBy);
  if (f.ending != null) sp.set("ending", String(f.ending));
  if (f.ended != null) sp.set("ended", String(f.ended));
  if (f.status) sp.set("status", f.status);
  if (f.renewed != null) sp.set("renewed", String(f.renewed));
  if (f.owner) sp.set("owner", f.owner);
  if (f.from != null) sp.set("from", String(f.from));
  if (f.to != null) sp.set("to", String(f.to));
  if (f.q) sp.set("q", f.q);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

const STATUS_LABEL: Record<RenewalStatusFilter, string> = {
  renewed: "Renewed",
  unpaid: "Renewed: unpaid",
  waitlisted: "Renewed: waitlisted",
  booked_unpaid: "Booked, not paid",
  not_renewed: "Not renewed",
  lapsed: "Lapsed",
};

/** A row is never the combined `booked_unpaid` bucket; that exists only as a list filter. */
export type RenewalRowStatus = Exclude<RenewalStatusFilter, "booked_unpaid">;

/** A row's renewal status: "none" reads Not renewed while the plan runs and Lapsed once its last tiffin has passed. */
export const rowStatus = (s: RenewalStatus, lastTiffin: string | null, today: string): RenewalRowStatus =>
  s !== "none" ? s : lastTiffin != null && lastTiffin < today ? "lapsed" : "not_renewed";

/** The top date range on its chosen date: ISO days in the app timezone for tiffin dates, epoch ms for the order date. */
export function resolveRange(f: RenewalsFilter, timezone: string): RenewalRange {
  return {
    by: f.dateBy,
    fromMs: f.from,
    toMs: f.to,
    fromIso: f.from != null ? zonedDateIso(f.from, timezone) : null,
    toIso: f.to != null ? zonedDateIso(f.to, timezone) : null,
  };
}
/** Trials read Converted / Not converted; the rest of the labels are shared. */
export const statusLabel =(s: RenewalStatusFilter, trial = false): string =>
  trial && s === "renewed" ? "Converted" : trial && s === "not_renewed" ? "Not converted" : STATUS_LABEL[s];
