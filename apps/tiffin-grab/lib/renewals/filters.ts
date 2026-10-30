// No "use client" and no db: the server page parses with it and builds the facet spec from the options.
import type { RenewalStatus } from "@/lib/services/orders.service";

/** Plans ending or lapsed (paid / trial), or every customer who has renewed. */
export type RenewalsTab = "renewals" | "trials" | "customers";

/** "Ending within N days" choices; 0 is today only. */
export const ENDING_DAYS = [0, 1, 2, 3, 7] as const;
/** "Ended in the last N days" choices: plans whose last tiffin has passed. */
export const ENDED_DAYS = [7, 14, 30, 60, 90] as const;
/** Renewed customers tab: "Renewed in the last N days" choices. */
export const RENEWED_DAYS = [7, 14, 30, 90] as const;
/** The Status filter: the renewal status, with "none" split by whether the plan is still running. */
export type RenewalStatusFilter = Exclude<RenewalStatus, "none"> | "not_renewed" | "lapsed";
export const RENEWAL_STATUSES: readonly RenewalStatusFilter[] = ["renewed", "unpaid", "waitlisted", "not_renewed", "lapsed"];

/** What the top date range filters on: the plan's last tiffin (default), its order date, or any delivery in range. */
export type DateBy = "last" | "ordered" | "running";
export const DATE_BY: readonly { value: DateBy; label: string }[] = [
  { value: "last", label: "Last tiffin in range" },
  { value: "ordered", label: "Ordered in range" },
  { value: "running", label: "Running in range" },
];

/**
 * `from`/`to`: the top date range, epoch ms (the page fills this month when absent). On the plan tabs
 * `dateBy` says which date it filters; on the customers tab it is the renewal's order date.
 */
export type RenewalsFilter = {
  tab: RenewalsTab;
  dateBy: DateBy;
  ending: number | null;
  ended: number | null;
  status: RenewalStatusFilter | null;
  renewed: number | null;
  from: number | null;
  to: number | null;
  q: string;
};

const pick = (v: string | undefined, allowed: readonly number[]) => {
  const n = Number(v);
  return v != null && v !== "" && allowed.includes(n) ? n : null;
};

const ms = (v: string | undefined) => (v && Number.isFinite(Number(v)) ? Number(v) : null);

/** `?tab=`, `?dateBy=`, `?from=&to=`, `?ending=<days>`, `?ended=<days>`, `?status=`, `?renewed=<days>`, `?q=`. */
export function parseRenewalsFilter(sp: Record<string, string | undefined>): RenewalsFilter {
  const tab = sp.tab === "trials" || sp.tab === "customers" ? sp.tab : "renewals";
  const dateBy = DATE_BY.find((d) => d.value === sp.dateBy)?.value ?? "last";
  const q = sp.q?.trim().replace(/\s+/g, " ") ?? "";
  const from = ms(sp.from);
  const to = ms(sp.to);
  if (tab === "customers") return { tab, dateBy, ending: null, ended: null, status: null, renewed: pick(sp.renewed, RENEWED_DAYS), from, to, q };
  const status = RENEWAL_STATUSES.find((s) => s === sp.status) ?? null;
  return { tab, dateBy, ending: pick(sp.ending, ENDING_DAYS), ended: pick(sp.ended, ENDED_DAYS), status, renewed: null, from, to, q };
}

/** The query string for a filter. */
export function renewalsQuery(f: RenewalsFilter): string {
  const sp = new URLSearchParams();
  if (f.tab !== "renewals") sp.set("tab", f.tab);
  if (f.dateBy !== "last") sp.set("dateBy", f.dateBy);
  if (f.ending != null) sp.set("ending", String(f.ending));
  if (f.ended != null) sp.set("ended", String(f.ended));
  if (f.status) sp.set("status", f.status);
  if (f.renewed != null) sp.set("renewed", String(f.renewed));
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
  not_renewed: "Not renewed",
  lapsed: "Lapsed",
};

/** A row's status: "none" reads Not renewed while the plan runs and Lapsed once its last tiffin has passed. */
export const rowStatus = (s: RenewalStatus, lastTiffin: string | null, today: string): RenewalStatusFilter =>
  s !== "none" ? s : lastTiffin != null && lastTiffin < today ? "lapsed" : "not_renewed";

/** Status label; trials read Converted / Not converted / Lapsed. Here, not in a client file: the server page builds the filter options from it. */
export function statusLabel(s: RenewalStatusFilter, tab: RenewalsTab): string {
  if (tab === "trials" && s === "renewed") return "Converted";
  if (tab === "trials" && s === "not_renewed") return "Not converted";
  return STATUS_LABEL[s];
}
