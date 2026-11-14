// One en-CA formatter set for calendar dates (ISO day strings read as UTC) and the cutoff time of day.
const utc = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-CA", { ...o, timeZone: "UTC" });

export const WEEKDAY_SHORT = utc({ weekday: "short" });
export const WEEKDAY_LONG = utc({ weekday: "long" });
export const DATE_LONG = utc({ weekday: "long", month: "long", day: "numeric" });
export const DATE_SHORT = utc({ weekday: "short", month: "short", day: "numeric" });
export const MONTH_DAY_SHORT = utc({ month: "short", day: "numeric" });
export const MONTH_DAY_LONG = utc({ month: "long", day: "numeric" });
export const MONTH_YEAR_LONG = utc({ month: "long", year: "numeric" });
export const MONTH_SHORT = utc({ month: "short" });
const HOUR = utc({ hour: "numeric", minute: "2-digit" });

/** "5:00 p.m." for an hour of the day (0-23); no date shown, so the zone is irrelevant. */
export const hourOfDay = (hour: number) => HOUR.format(Date.UTC(2026, 0, 1, hour));
