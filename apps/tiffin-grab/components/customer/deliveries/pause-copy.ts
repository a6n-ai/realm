import { humanDate } from "@/lib/deliveries-view";
import { weekdayShort } from "@/lib/deliveries-view/eating";

const list = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** Weekday names when they are few and distinct ("Wed and Thu"); otherwise a count, so the line stays short. */
function who(dates: string[]): string {
  const names = dates.map(weekdayShort);
  return names.length <= 4 && new Set(names).size === names.length ? list(names) : `${dates.length} days`;
}

export const pausedLine = (dates: string[], pastCutoff: string[] = []) =>
  `Paused ${who(dates)}.${pastCutoff.length ? ` ${who(pastCutoff)} ${pastCutoff.length === 1 ? "was" : "were"} already past cutoff.` : ""}`;
export const backOnLine = (dates: string[]) => (dates.length === 1 ? `${who(dates)} is back on.` : `${who(dates)} are back on.`);

type Reclosed = { date: string; holidayName: string; placed: boolean };

/** What to tell the customer after Resume: the days that came back and/or the days a holiday closed again. Null when neither. */
export function resumeLine(dates: string[], reclosed: Reclosed[] = []): string | null {
  const closed = reclosed.map((r) => `Kitchen is closed on ${humanDate(r.date)} (${r.holidayName}). ${r.placed ? "Your tiffin was added to the end of your plan." : "We will place your tiffin on a new day."}`).join(" ");
  const back = dates.length > 0 ? backOnLine(dates) : "";
  return [back, closed].filter(Boolean).join(" ") || null;
}
