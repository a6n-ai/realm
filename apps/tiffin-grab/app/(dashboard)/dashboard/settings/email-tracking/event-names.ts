import type { EmailEventType, StreamKind } from "@relay/email/events/types";

export const STREAM_NAME: Record<StreamKind, string> = {
  untracked: "Standard emails",
  tracked: "Tracked emails",
  marketing: "Campaigns",
};

export const EVENT_NAME: Record<EmailEventType, string> = {
  send: "Sent",
  delivery: "Delivered",
  delivery_delay: "Delayed",
  open: "Opened",
  click: "Clicked",
  bounce: "Bounced",
  complaint: "Marked as spam",
  reject: "Rejected by SES",
  rendering_failure: "Template error",
  subscription: "Unsubscribed (list)",
};

export const FORCED_NOTE = "Needed to stop emailing bad addresses.";

export function trackedChanges(before: Iterable<string>, after: Iterable<string>, label: (e: string) => string): string[] {
  const b = new Set(before);
  const a = new Set(after);
  return [
    ...[...a].filter((e) => !b.has(e)).map((e) => `${label(e)}: tracking on`),
    ...[...b].filter((e) => !a.has(e)).map((e) => `${label(e)}: tracking off`),
  ];
}

export function routingChanges(
  before: { webhook: readonly EmailEventType[]; counts: readonly EmailEventType[] | null },
  after: { webhook: readonly EmailEventType[]; counts: readonly EmailEventType[] | null },
  forced: readonly EmailEventType[],
): string[] {
  const col = (name: string, b: readonly EmailEventType[], a: readonly EmailEventType[], skip: readonly EmailEventType[] = []) => [
    ...a.filter((t) => !b.includes(t)).map((t) => `${EVENT_NAME[t]}: ${name} on`),
    ...b.filter((t) => !a.includes(t) && !skip.includes(t)).map((t) => `${EVENT_NAME[t]}: ${name} off`),
  ];
  return [
    ...col("shown in Logs", before.webhook, after.webhook, forced),
    ...(before.counts && after.counts ? col("counted in totals", before.counts, after.counts) : []),
  ];
}

export function streamSummary(routing: { webhook: readonly EmailEventType[]; counts: readonly EmailEventType[] | null }) {
  const names = (l: readonly EmailEventType[]) => (l.length ? l.map((t) => EVENT_NAME[t]).join(", ") : "Nothing");
  return {
    logs: `Shown per email in Logs: ${names(routing.webhook)}`,
    totals: routing.counts ? `Counted in totals: ${names(routing.counts)}` : "Counted in totals: not set up",
  };
}

export function trackedStatus(n: number, available = true): string {
  if (!available) return "Open and click tracking isn't set up for this app yet.";
  if (n === 0) return "Nothing to set up. No emails are tracked — that's the default.";
  return `${n} email ${n === 1 ? "type is" : "types are"} tracked.`;
}
