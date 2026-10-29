// No "use client" and no db: the server page parses with it and builds the facet spec from the options.
import type { RenewalStatus } from "@/lib/services/orders.service";

/** Plans ending or lapsed (paid / trial), or every customer who has renewed. */
export type RenewalsTab = "renewals" | "trials" | "customers";

/** "Ending within N days" choices; 0 is today only. */
export const ENDING_DAYS = [0, 1, 2, 3, 7] as const;
/** "Ended in the last N days" choices, for plans that lapsed with no later plan. */
export const ENDED_DAYS = [7, 14, 30, 60, 90] as const;
export const DEFAULT_ENDING = 7;
/** Renewed customers tab: "Renewed in the last N days" choices. */
export const RENEWED_DAYS = [7, 14, 30, 90] as const;
export const RENEWAL_STATUSES: readonly RenewalStatus[] = ["renewed", "unpaid", "waitlisted", "none"];

export type RenewalsFilter = { tab: RenewalsTab; ending: number | null; ended: number | null; status: RenewalStatus | null; renewed: number | null; q: string };

const pick = (v: string | undefined, allowed: readonly number[]) => {
  const n = Number(v);
  return v != null && v !== "" && allowed.includes(n) ? n : null;
};

/** No window in the URL: the page redirects to the default so the filter bar shows what is applied. */
export const missingWindow = (sp: Record<string, string | undefined>) => sp.tab !== "customers" && !sp.ending && !sp.ended;

/** `?tab=trials|customers`, `?ending=<days>`, `?ended=<days>`, `?status=`, `?renewed=<days>`, `?q=`. Never leaves both windows off on a plans tab. */
export function parseRenewalsFilter(sp: Record<string, string | undefined>): RenewalsFilter {
  const tab = sp.tab === "trials" || sp.tab === "customers" ? sp.tab : "renewals";
  const q = sp.q?.trim().replace(/\s+/g, " ") ?? "";
  if (tab === "customers") return { tab, ending: null, ended: null, status: null, renewed: pick(sp.renewed, RENEWED_DAYS), q };
  const ended = pick(sp.ended, ENDED_DAYS);
  const ending = pick(sp.ending, ENDING_DAYS) ?? (ended == null ? DEFAULT_ENDING : null);
  const status = RENEWAL_STATUSES.find((s) => s === sp.status) ?? null;
  return { tab, ending, ended, status, renewed: null, q };
}

/** The query string for a filter. */
export function renewalsQuery(f: RenewalsFilter): string {
  const sp = new URLSearchParams();
  if (f.tab !== "renewals") sp.set("tab", f.tab);
  if (f.ending != null) sp.set("ending", String(f.ending));
  if (f.ended != null) sp.set("ended", String(f.ended));
  if (f.status) sp.set("status", f.status);
  if (f.renewed != null) sp.set("renewed", String(f.renewed));
  if (f.q) sp.set("q", f.q);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

const STATUS_LABEL: Record<RenewalStatus, string> = {
  renewed: "Renewed",
  unpaid: "Renewed: unpaid",
  waitlisted: "Renewed: waitlisted",
  none: "Not renewed",
};

/** Next-plan status label; on trials it reads Converted / Not converted. Here, not in a client file: the server page builds the filter options from it. */
export function statusLabel(s: RenewalStatus, tab: RenewalsTab): string {
  if (tab === "trials" && s === "renewed") return "Converted";
  if (tab === "trials" && s === "none") return "Not converted";
  return STATUS_LABEL[s];
}
