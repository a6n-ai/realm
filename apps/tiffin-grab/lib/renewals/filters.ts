// No "use client" and no db: the server page parses with it and builds the facet spec from the options.
import type { RenewalStatus } from "@/lib/services/orders.service";

/** Plans ending or lapsed (paid / trial), or every customer who has renewed. */
export type RenewalsTab = "renewals" | "trials" | "customers";

/** "Ending within N days" choices; 0 is today only. */
export const ENDING_DAYS = [0, 1, 2, 3, 7] as const;
/** "Ended in the last N days" choices, for plans that lapsed with no later plan. */
export const ENDED_DAYS = [7, 14, 30, 60, 90] as const;
export const DEFAULT_ENDING = 7;
/** Explicit clear of the Ending within facet (`?ending=off`); keeps the redirect from re-applying the default. */
export const ENDING_OFF = "off";
/** Renewed customers tab: "Renewed in the last N days" choices. */
export const RENEWED_DAYS = [7, 14, 30, 90] as const;
/** The Status filter: the renewal status, with "none" split by whether the plan is still running. */
export type RenewalStatusFilter = Exclude<RenewalStatus, "none"> | "not_renewed" | "lapsed";
export const RENEWAL_STATUSES: readonly RenewalStatusFilter[] = ["renewed", "unpaid", "waitlisted", "not_renewed", "lapsed"];

/** `from`/`to`: the order-date facet's epoch-ms bounds (the plan's order date; on the customers tab, the renewal's). */
export type RenewalsFilter = {
  tab: RenewalsTab;
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

/** Bare plans URL (no ending/ended): the page redirects to `ending=7`. `ending=off` is an explicit clear and must not redirect. */
export const missingWindow = (sp: Record<string, string | undefined>) => sp.tab !== "customers" && !sp.ending && !sp.ended;

/** `?tab=trials|customers`, `?ending=<days>|off`, `?ended=<days>`, `?status=`, `?renewed=<days>`, `?q=`. */
export function parseRenewalsFilter(sp: Record<string, string | undefined>): RenewalsFilter {
  const tab = sp.tab === "trials" || sp.tab === "customers" ? sp.tab : "renewals";
  const q = sp.q?.trim().replace(/\s+/g, " ") ?? "";
  const from = ms(sp.from);
  const to = ms(sp.to);
  if (tab === "customers") return { tab, ending: null, ended: null, status: null, renewed: pick(sp.renewed, RENEWED_DAYS), from, to, q };
  const ended = pick(sp.ended, ENDED_DAYS);
  // `ending=off` clears the window without falling back to the 7-day default (so Ended / Status can stand alone).
  const ending = sp.ending === ENDING_OFF ? null : pick(sp.ending, ENDING_DAYS) ?? (ended == null ? DEFAULT_ENDING : null);
  const status = RENEWAL_STATUSES.find((s) => s === sp.status) ?? null;
  return { tab, ending, ended, status, renewed: null, from, to, q };
}

/** The query string for a filter. Chip-cleared `ending=off` is written by the facet bar, not here. */
export function renewalsQuery(f: RenewalsFilter): string {
  const sp = new URLSearchParams();
  if (f.tab !== "renewals") sp.set("tab", f.tab);
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
