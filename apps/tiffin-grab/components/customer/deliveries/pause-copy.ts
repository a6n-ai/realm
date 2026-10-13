import { weekdayShort } from "@/lib/deliveries-view/eating";

const list = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** Weekday names when they are few and distinct ("Wed and Thu"); otherwise a count, so the line stays short. */
function who(dates: string[]): string {
  const names = dates.map(weekdayShort);
  return names.length <= 4 && new Set(names).size === names.length ? list(names) : `${dates.length} days`;
}

export const pausedLine = (dates: string[]) => `Paused ${who(dates)}.`;
export const backOnLine = (dates: string[]) => (dates.length === 1 ? `${who(dates)} is back on.` : `${who(dates)} are back on.`);
