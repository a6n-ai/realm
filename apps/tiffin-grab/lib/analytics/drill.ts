/**
 * Links from an analytics figure to the list that produced it.
 *
 * The payments list filters `createdAt` with epoch `from`/`to`. Revenue totals
 * follow the day the money moved (capturedAt, else createdAt) in the app
 * timezone. These helpers turn that calendar range into the epoch window the
 * list already understands, so a click lands on the same days.
 */

const PAYMENTS = "/dashboard/payments/all";
const ORDERS = "/dashboard/orders";
const INQUIRIES = "/dashboard/inquiries";
const CUSTOMERS = "/dashboard/customers";

function zoneOffsetMs(epoch: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(epoch));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  // h23 can report midnight as hour 24 on the previous calendar day.
  const hour = get("hour") % 24;
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return asUtc - epoch;
}

/** Epoch ms of midnight at the start of `isoDate` in `timeZone`. */
export function zonedDayStart(isoDate: string, timeZone: string): number {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const utcMidnight = Date.UTC(y, m - 1, d);
  let start = utcMidnight - zoneOffsetMs(utcMidnight, timeZone);
  start = utcMidnight - zoneOffsetMs(start, timeZone);
  return start;
}

function nextIsoDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** Inclusive calendar range in `timeZone`, as the epoch window list filters expect. */
export function zonedRangeMs(from: string, to: string, timeZone: string): { from: number; to: number } {
  return { from: zonedDayStart(from, timeZone), to: zonedDayStart(nextIsoDate(to), timeZone) - 1 };
}

export function paymentsHref(opts: {
  statuses?: readonly string[];
  methods?: readonly string[];
  fromMs?: number;
  toMs?: number;
} = {}): string {
  const qs = new URLSearchParams();
  if (opts.statuses?.length) qs.set("status", opts.statuses.join(","));
  if (opts.methods?.length) qs.set("method", opts.methods.join(","));
  if (opts.fromMs != null) qs.set("from", String(opts.fromMs));
  if (opts.toMs != null) qs.set("to", String(opts.toMs));
  const s = qs.toString();
  return s ? `${PAYMENTS}?${s}` : PAYMENTS;
}

export function ordersHref(params: { status?: string; plan?: string; tier?: string } = {}): string {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.plan) qs.set("plan", params.plan);
  if (params.tier) qs.set("tier", params.tier);
  const s = qs.toString();
  return s ? `${ORDERS}?${s}` : ORDERS;
}

export function inquiriesHref(params: { stage?: string; source?: string; owner?: string } = {}): string {
  const qs = new URLSearchParams();
  if (params.stage) qs.set("stage", params.stage);
  if (params.source) qs.set("source", params.source);
  if (params.owner) qs.set("owner", params.owner);
  const s = qs.toString();
  return s ? `${INQUIRIES}?${s}` : INQUIRIES;
}

export function customersHref(): string {
  return CUSTOMERS;
}
