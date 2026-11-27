import { useEffect, useState } from "react";

// The server has no browser timezone, so first paint is UTC on both sides and the browser zone applies after mount.
export function LocalTime({ at, time = false }: { at: number; time?: boolean }) {
  const [zone, setZone] = useState<string | undefined>("UTC");
  useEffect(() => setZone(undefined), []);
  const text = new Intl.DateTimeFormat("en-CA", {
    dateStyle: "medium",
    ...(time ? { timeStyle: "short" } : {}),
    timeZone: zone,
  }).format(at);
  return <time dateTime={new Date(at).toISOString()}>{text}</time>;
}
