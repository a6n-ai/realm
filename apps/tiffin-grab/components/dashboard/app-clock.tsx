"use client";

import { useEffect, useState } from "react";
import { useTimezone } from "@/components/providers/timezone-provider";

// Live clock in the app-settings timezone, so staff in another zone (India) see
// business time. Renders nothing until mounted: server and browser clocks differ,
// so any SSR text would mismatch on hydration.
export function AppClock() {
  const tz = useTimezone();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  if (now === null) return null;

  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(now);

  return (
    <span
      title={`Canada time (${tz})`}
      className="hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs tabular-nums text-muted-foreground sm:inline-flex"
    >
      <span role="img" aria-label="Canada time" className="text-sm leading-none">🇨🇦</span>
      {label}
    </span>
  );
}
