/** One weekday's support window, "HH:MM" 24h in the app timezone. */
export type DayHours = { open: string; close: string };

export type SupportHours = {
  /** Index 0 = Sunday (JS `getDay`). null = no support that day. */
  days: (DayHours | null)[];
  /** Usual time to a first reply, in hours. null = not promised. */
  replyWithinHours: number | null;
};

export const SUPPORT_HOURS_DEFAULT: SupportHours = { days: Array(7).fill(null), replyWithinHours: null };

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Display order: the week starts on Monday. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

/** Stored or submitted value → a safe config. Throws on a bad window so a save can't store one. */
export function parseSupportHours(raw: unknown): SupportHours {
  const src = (raw ?? {}) as Partial<SupportHours>;
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = Array.isArray(src.days) ? src.days[i] : null;
    if (d == null) return null;
    if (!HHMM.test(d.open) || !HHMM.test(d.close)) throw new Error(`${DAY_NAMES[i]}: enter both times`);
    if (minutes(d.close) <= minutes(d.open)) throw new Error(`${DAY_NAMES[i]}: closing time must be after opening time`);
    return { open: d.open, close: d.close };
  });
  const r = src.replyWithinHours;
  if (r != null && (!Number.isInteger(r) || r < 1 || r > 168)) throw new Error("Reply time must be a whole number of hours from 1 to 168");
  return { days, replyWithinHours: r ?? null };
}

/** "09:00" → "9 am", "17:30" → "5:30 pm". */
export function formatTime(hhmm: string): string {
  const h = Number(hhmm.slice(0, 2));
  const m = hhmm.slice(3);
  return `${h % 12 || 12}${m === "00" ? "" : `:${m}`} ${h < 12 ? "am" : "pm"}`;
}

function nowIn(timezone: string, now: number): { day: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { day: DAY_NAMES.indexOf(get("weekday")), minute: Number(get("hour")) * 60 + Number(get("minute")) };
}

export type SupportHoursView = {
  open: boolean;
  /** "Open now until 6 pm" / "Closed now. Opens Mon at 9 am". */
  status: string;
  /** "We usually reply within 2 hours", when promised. */
  reply: string | null;
  /** Mon-first rows for the full week. */
  week: { day: string; hours: string; today: boolean }[];
};

/** What the customer is told about support availability. null until staff set at least one day. */
export function supportHoursView(cfg: SupportHours, timezone: string, now = Date.now()): SupportHoursView | null {
  if (cfg.days.every((d) => d == null)) return null;
  const { day, minute } = nowIn(timezone, now);
  const today = cfg.days[day];
  const open = today != null && minute >= minutes(today.open) && minute < minutes(today.close);

  let status: string;
  if (open) status = `Open now until ${formatTime(today.close)}`;
  else if (today && minute < minutes(today.open)) status = `Closed now. Opens today at ${formatTime(today.open)}`;
  else {
    // At least one day is set, so some offset 1..7 always hits.
    const offset = [1, 2, 3, 4, 5, 6, 7].find((o) => cfg.days[(day + o) % 7] != null)!;
    const next = (day + offset) % 7;
    status = `Closed now. Opens ${offset === 1 ? "tomorrow" : DAY_NAMES[next]} at ${formatTime(cfg.days[next]!.open)}`;
  }

  const n = cfg.replyWithinHours;
  return {
    open,
    status,
    reply: n == null ? null : `We usually reply within ${n} ${n === 1 ? "hour" : "hours"} during support hours`,
    week: WEEK_ORDER.map((i) => {
      const d = cfg.days[i];
      return { day: DAY_NAMES[i], hours: d ? `${formatTime(d.open)} – ${formatTime(d.close)}` : "Closed", today: i === day };
    }),
  };
}
