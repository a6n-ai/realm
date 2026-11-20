import { activePreset, DATE_PRESETS, presetRange, type DatePresetKey } from "@/lib/analytics/date-presets";
import { currentMonthEpochRange, zonedRangeMs } from "@/lib/dates/epoch-window";
import { isoDateInZone } from "@foundry/commons/util/dates";

export type RangeSearch = Record<string, string | undefined>;
export type ParsedRange = { from?: number; to?: number; preset?: DatePresetKey; all?: boolean };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const EPOCH = /^\d{10,}$/;
// End of year 9999: later epochs format to 5-digit years that no ISO parser reads back.
const MAX_MS = 253402300799999;

const isPreset = (v: string | undefined): v is DatePresetKey => DATE_PRESETS.some((p) => p.key === v);

function validIso(v: string): boolean {
  const t = Date.parse(`${v}T00:00:00Z`);
  return ISO.test(v) && Number.isFinite(t) && new Date(t).toISOString().startsWith(v);
}

function bound(raw: string | undefined, edge: "from" | "to", tz: string): number | undefined {
  if (!raw) return undefined;
  if (EPOCH.test(raw)) {
    const n = Number(raw);
    return Number.isSafeInteger(n) && n <= MAX_MS ? n : undefined;
  }
  if (!validIso(raw)) return undefined;
  return zonedRangeMs(raw, raw, tz)[edge];
}

/** Reads `range=<preset>`, ISO `from`/`to`, or legacy epoch-ms `from`/`to`. Nothing valid means the caller's default. */
export function parseRangeParams(sp: RangeSearch, tz: string, now = Date.now()): ParsedRange {
  const all = sp.dates === "all" ? { all: true } : {};
  if (isPreset(sp.range)) return { ...all, preset: sp.range, ...presetRange(sp.range, tz, now) };
  const days = sp.from && sp.to && validIso(sp.from) && validIso(sp.to) && sp.from > sp.to;
  const a = bound(days ? sp.to : sp.from, "from", tz);
  const b = bound(days ? sp.from : sp.to, "to", tz);
  if (a != null && b != null) return { ...all, from: Math.min(a, b), to: Math.max(a, b) };
  const out: ParsedRange = { ...all };
  if (a != null) out.from = a;
  if (b != null) out.to = b;
  return out;
}

function edgeParam(ms: number, edge: "from" | "to", tz: string): string {
  const iso = isoDateInZone(ms, tz);
  return zonedRangeMs(iso, iso, tz)[edge] === ms ? iso : String(ms);
}

/** URL params for a window. The default month writes none; a preset writes its key; days write ISO dates. `exact` never collapses a window into a relative form, so a frozen window stays frozen. */
export const dateQs = (params: Record<string, string>): string => new URLSearchParams(params).toString();

export function rangeParams(
  range: { from?: number; to?: number } | { preset: DatePresetKey },
  tz: string,
  now = Date.now(),
  opts: { exact?: boolean } = {},
): Record<string, string> {
  if ("preset" in range) return range.preset === "this-month" ? {} : { range: range.preset };
  const { from, to } = range;
  if (from != null && to != null && !opts.exact) {
    const month = currentMonthEpochRange(tz, now);
    if (from === month.from && to === month.to) return {};
    const key = activePreset({ from, to }, tz, now);
    if (key) return { range: key };
  }
  const out: Record<string, string> = {};
  if (from != null) out.from = edgeParam(from, "from", tz);
  if (to != null) out.to = edgeParam(to, "to", tz);
  return out;
}

/** URL query form of the window a page shows (`range=last-7`, `from=..&to=..`, or ""), set by `fillDefaultMonth` for drill links. A string so it fits a `Record<string, string | undefined>` search-params type. */
export type WithUrlDates = { dateQs?: string };

/** Writes a page's window onto a drill link. A hand-built `{ from, to }` without `dateQs` stays epoch ms. */
export function setDateParams(qs: URLSearchParams, sp: WithUrlDates & { from?: string; to?: string }): void {
  if (sp.dateQs != null) {
    for (const [k, v] of new URLSearchParams(sp.dateQs)) qs.set(k, v);
    return;
  }
  if (sp.from) qs.set("from", sp.from);
  if (sp.to) qs.set("to", sp.to);
}

/** `path` plus the page's window (and any `extra` params), with no `?` when there is nothing to write. */
export function hrefWithDates(
  path: string,
  sp: WithUrlDates & { from?: string; to?: string },
  extra: Record<string, string> = {},
): string {
  const qs = new URLSearchParams();
  setDateParams(qs, sp);
  for (const [k, v] of Object.entries(extra)) qs.set(k, v);
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}
