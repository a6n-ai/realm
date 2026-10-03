// Scheduled jobs shown in Settings → Scheduled jobs. Client-safe: no server imports.
//
// `cron` mirrors .github/workflows/cron-tiffin-grab.yml (GitHub's schedule can't be read from
// the app); change both together. Times are UTC, as GitHub runs them.

export type CronJobKey = "pull-completions" | "notifications" | "optimoroute-sync" | "review-nudge" | "mint-rep-coupons";

export type CronJob = {
  key: CronJobKey;
  name: string;
  description: string;
  /** UTC cron expression ("M H * * *" or "M * * * *"), or null when nothing schedules it. */
  cron: string | null;
  /** Safe for an admin to start from Settings. */
  runnable: boolean;
};

export const CRON_JOBS: CronJob[] = [
  {
    key: "pull-completions",
    name: "OptimoRoute completion pull",
    description: "Reads today's delivered / failed stops from OptimoRoute. Only this or an admin marks a delivery delivered.",
    cron: "0 2 * * *",
    runnable: true,
  },
  {
    key: "notifications",
    name: "Notifications backstop",
    description: "Sends scheduled campaigns when their time comes and anything a lost Redis signal left pending.",
    cron: "0 * * * *",
    runnable: true,
  },
  {
    key: "optimoroute-sync",
    name: "OptimoRoute route sync",
    description: "Pushes tomorrow's stops and pulls planned routes back. Run from Dispatch for now.",
    cron: null,
    runnable: false,
  },
  {
    key: "review-nudge",
    name: "Review request emails",
    description: "Asks customers for a Google review after a delivery.",
    cron: null,
    runnable: false,
  },
  {
    key: "mint-rep-coupons",
    name: "Rep coupons",
    description: "Issues each rep's daily discount coupon.",
    cron: null,
    runnable: false,
  },
];

/**
 * Next UTC run of a simple cron ("M H * * *" daily, "M * * * *" hourly) strictly after `now`.
 * ponytail: only the two shapes the workflow uses; anything else returns null.
 */
export function nextCronRun(cron: string, now: number): number | null {
  const m = /^(\d{1,2}) (\*|\d{1,2}) \* \* \*$/.exec(cron.trim());
  if (!m) return null;
  const minute = Number(m[1]);
  const d = new Date(now);
  d.setUTCSeconds(0, 0);
  if (m[2] === "*") {
    d.setUTCMinutes(minute);
    if (d.getTime() <= now) d.setUTCHours(d.getUTCHours() + 1);
    return d.getTime();
  }
  d.setUTCHours(Number(m[2]), minute);
  if (d.getTime() <= now) d.setUTCDate(d.getUTCDate() + 1);
  return d.getTime();
}

/** "Daily 10:00 PM" / "Every hour at :00" in the app timezone, for display. */
export function describeCron(cron: string | null, timezone: string, now: number): string {
  if (!cron) return "Not scheduled";
  const m = /^(\d{1,2}) (\*|\d{1,2}) \* \* \*$/.exec(cron.trim());
  if (!m) return cron;
  if (m[2] === "*") return `Every hour at :${m[1].padStart(2, "0")}`;
  const next = nextCronRun(cron, now)!;
  const time = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(next);
  return `Daily ${time}`;
}
