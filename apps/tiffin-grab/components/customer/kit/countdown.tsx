"use client";

import { useEffect, useState } from "react";

export function formatRelative(ms: number) {
  if (ms <= 0) return "passed";
  const m = Math.floor(ms / 60_000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d > 0) return `in ${d}d ${h}h`;
  if (h > 0) return `in ${h}h ${m % 60}m`;
  return `in ${m}m`;
}

interface Props {
  target: Date | number;
  timeZone?: string;
  className?: string;
}

/** Absolute time plus a relative line that ticks once a minute. */
export function Countdown({ target, timeZone, className }: Props) {
  const t = +target;
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const i = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(i);
  }, []);
  const abs = new Intl.DateTimeFormat("en-CA", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone }).format(t);
  return (
    <time dateTime={new Date(t).toISOString()} className={className}>
      {abs}
      {now !== null && <span className="text-[var(--muted-foreground,#6E6558)]"> · {formatRelative(t - now)}</span>}
    </time>
  );
}
