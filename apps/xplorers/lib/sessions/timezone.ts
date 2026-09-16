import { ValidationError } from "@foundry/commons";

type DateParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
};

function zonedParts(date: Date, timeZone: string): DateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const map: Partial<DateParts> = {};
  for (const part of parts) {
    if (
      part.type === "year" ||
      part.type === "month" ||
      part.type === "day" ||
      part.type === "hour" ||
      part.type === "minute" ||
      part.type === "second"
    ) {
      map[part.type] = part.value;
    }
  }
  return map as DateParts;
}

function tzOffsetMs(date: Date, timeZone: string): number {
  const map = zonedParts(date, timeZone);
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return asUtc - date.getTime();
}

/** Interpret `YYYY-MM-DDTHH:mm` as wall clock in `timeZone`. */
export function fromZonedLocal(local: string, timeZone: string): Date {
  const match = local.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) throw new ValidationError("Start and end times are required.");
  const utcGuess = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    0,
  );
  const first = new Date(utcGuess - tzOffsetMs(new Date(utcGuess), timeZone));
  return new Date(utcGuess - tzOffsetMs(first, timeZone));
}

export function toZonedLocal(date: Date, timeZone: string): string {
  const map = zonedParts(date, timeZone);
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

export function dayKey(date: Date, timeZone: string): string {
  const map = zonedParts(date, timeZone);
  return `${map.year}-${map.month}-${map.day}`;
}
