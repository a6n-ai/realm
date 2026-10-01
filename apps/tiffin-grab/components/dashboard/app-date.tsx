"use client";

import { useTimezone } from "@/components/providers/timezone-provider";
import { formatEpoch } from "@/lib/format/datetime";

/** A timestamp's calendar date in the app timezone, not the viewer's browser zone. */
export function AppDate({ value }: { value: number | string | Date }) {
  const tz = useTimezone();
  return <>{formatEpoch(new Date(value).getTime(), { mode: "date", timeZone: tz })}</>;
}
