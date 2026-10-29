// No "use client" and no db: the server page parses with it and the client filter bar reads the options.

export type RenewalsTab = "renewals" | "trials";

/** "Ending within N days" choices; 0 is today only. */
export const ENDING_DAYS = [0, 1, 2, 3, 7] as const;
/** "Ended in the last N days" choices, for plans that lapsed with no later plan. */
export const ENDED_DAYS = [7, 14, 30, 60, 90] as const;
const DEFAULT_ENDING = 7;

export type RenewalsFilter = { tab: RenewalsTab; ending: number | null; ended: number | null };

const pick = (v: string | undefined, allowed: readonly number[]) => {
  const n = Number(v);
  return v != null && v !== "" && allowed.includes(n) ? n : null;
};

/**
 * `?tab=trials`, `?ending=<days>|off`, `?ended=<days>`. With neither window in the URL the list shows
 * plans ending within 7 days; `ending=off` turns that window off so only lapsed plans show.
 */
export function parseRenewalsFilter(sp: Record<string, string | undefined>): RenewalsFilter {
  const tab = sp.tab === "trials" ? "trials" : "renewals";
  const ended = pick(sp.ended, ENDED_DAYS);
  const ending = sp.ending === undefined && ended == null ? DEFAULT_ENDING : pick(sp.ending, ENDING_DAYS);
  return { tab, ending: ending == null && ended == null ? DEFAULT_ENDING : ending, ended };
}

/** The query string for a filter, keeping the defaults out of the URL. */
export function renewalsQuery(f: RenewalsFilter): string {
  const sp = new URLSearchParams();
  if (f.tab === "trials") sp.set("tab", "trials");
  if (f.ending == null) sp.set("ending", "off");
  else if (f.ending !== DEFAULT_ENDING || f.ended != null) sp.set("ending", String(f.ending));
  if (f.ended != null) sp.set("ended", String(f.ended));
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}
