import { humanDate } from "@/lib/deliveries/view";
export type RouteLineCounts = { total: number; sent: number; routed: number; done: number; lastSentAt: number | null };

export type RouteLineInput = {
  installed: boolean;
  hasApiKey: boolean;
  canDispatch: boolean;
  canSettings: boolean;
  tz: string;
  counts: RouteLineCounts | null;
  now?: number;
};

/** `title` is the row's name in the sidebar card ("Today", "Mon, Nov 23"); `label` its value. */
export type RouteLine = { title?: string; label: string; tone: "ok" | "warn" | "muted"; href: string; hint: string | null };

const DISPATCH = "/dashboard/dispatch";
const SETTINGS = "/dashboard/settings/optimoroute";

export function routeLine({ installed, hasApiKey, canDispatch, canSettings, tz, counts, now = Date.now() }: RouteLineInput): RouteLine | null {
  if (!installed) {
    return canSettings
      ? { label: "Not connected", tone: "muted", href: SETTINGS, hint: null }
      : null;
  }
  if (!hasApiKey && canSettings && !canDispatch) return { label: "Not connected", tone: "muted", href: SETTINGS, hint: null };
  if (!canDispatch) return null;
  if (!hasApiKey) return { label: "Not connected", tone: "muted", href: DISPATCH, hint: null };
  if (!counts || counts.total === 0) return null;

  const { total, sent, routed, done, lastSentAt } = counts;
  const hint = `Sent ${sent}/${total} · Routes pulled ${routed}/${total} · Delivered ${done}/${total}`;
  if (sent === 0) return { label: "Not sent yet", tone: "warn", href: DISPATCH, hint };
  if (routed > 0) return { label: "Routes pulled", tone: "ok", href: DISPATCH, hint };
  if (sent < total || lastSentAt === null) return { label: `Sent ${sent}/${total}`, tone: "warn", href: DISPATCH, hint };
  const time = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" })
    .format(lastSentAt)
    .toLowerCase();
  // Today's run is usually pushed the evening before, so a bare time would read as today's.
  const day = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(ms);
  const when = day(lastSentAt) === day(now) ? time : day(lastSentAt) === day(now - 86_400_000) ? `yesterday ${time}` : `${new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(lastSentAt)}, ${time}`;
  return { label: `Sent ${when}`, tone: "ok", href: DISPATCH, hint };
}

/** "Mon, Nov 23 not pushed" for the sidebar card; humanDate keeps the wording the Dispatch page uses. */
export function nextPushLine({ date, total, pushed }: { date: string; total: number; pushed: number }): RouteLine {
  const day = humanDate(date);
  const hint = `${pushed} of ${total} stops for ${day} are on OptimoRoute`;
  if (pushed === 0) return { title: day, label: "Not pushed", tone: "warn", href: DISPATCH, hint };
  if (pushed < total) return { title: day, label: `Pushed ${pushed}/${total}`, tone: "warn", href: DISPATCH, hint };
  return { title: day, label: "Pushed", tone: "ok", href: DISPATCH, hint };
}
