import { Tooltip, TooltipContent, TooltipTrigger } from "@foundry/ui/tooltip";
import { useEffect, useState } from "react";
import { LocalTime } from "./local-time";

const UNITS: [number, string][] = [
  [60_000, "m"],
  [3_600_000, "h"],
  [86_400_000, "d"],
  [7 * 86_400_000, "w"],
];

export function relativeTime(at: number, now: number): string {
  const diff = Math.max(0, now - at);
  if (diff < 60_000) return "just now";
  if (diff >= 30 * 86_400_000) return "";
  let label = "";
  for (const [ms, unit] of UNITS) if (diff >= ms) label = `${Math.floor(diff / ms)}${unit} ago`;
  return label;
}

// Server and first client paint show the date; the relative text needs the browser clock, so it lands after mount. Hover shows the exact time.
export function RelativeTime({ at }: { at: number }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);
  const rel = now === null ? "" : relativeTime(at, now);
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="cursor-default" />}>{rel || <LocalTime at={at} />}</TooltipTrigger>
      <TooltipContent>
        <LocalTime at={at} time />
      </TooltipContent>
    </Tooltip>
  );
}
