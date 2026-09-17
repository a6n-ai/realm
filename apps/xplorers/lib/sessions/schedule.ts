import { ValidationError } from "@foundry/commons";
import { dayKey, fromZonedLocal, toZonedLocal } from "./timezone";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDates(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [];
  const out: string[] = [];
  for (const item of raw) {
    const trimmed = String(item ?? "").trim();
    if (!trimmed) continue;
    if (!DATE_RE.test(trimmed)) throw new ValidationError("Each class date must be a calendar day.");
    if (!out.includes(trimmed)) out.push(trimmed);
  }
  out.sort();
  if (out.length === 0) throw new ValidationError("Pick at least one date.");
  return out;
}

export function assertSameCalendarDay(startsAt: Date, endsAt: Date, timeZone: string): void {
  if (dayKey(startsAt, timeZone) !== dayKey(endsAt, timeZone)) {
    throw new ValidationError("A class is one day. Start and end must be on the same date.");
  }
}

export function clockFrom(date: Date, timeZone: string): string {
  return toZonedLocal(date, timeZone).slice(11, 16);
}

export function occurrenceStartsAt(occursOn: string, startsAt: Date, timeZone: string): Date {
  return fromZonedLocal(`${occursOn}T${clockFrom(startsAt, timeZone)}`, timeZone);
}

export function occurrenceEndsAt(occursOn: string, startsAt: Date, endsAt: Date, timeZone: string): Date {
  const start = occurrenceStartsAt(occursOn, startsAt, timeZone);
  return new Date(start.getTime() + (endsAt.getTime() - startsAt.getTime()));
}
