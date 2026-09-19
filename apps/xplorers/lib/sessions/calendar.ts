import { ValidationError } from "@foundry/commons";
import { addDayKey, dayKey } from "./timezone";

const MONTH_RE = /^\d{4}-\d{2}$/;

export function parseMonth(value: unknown, timeZone: string, now = new Date()): string {
  const raw = String(value ?? "").trim();
  if (MONTH_RE.test(raw)) return raw;
  return dayKey(now, timeZone).slice(0, 7);
}

export function addMonth(month: string, delta: number): string {
  if (!MONTH_RE.test(month)) throw new ValidationError("Month must be YYYY-MM.");
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1 + delta;
  const date = new Date(Date.UTC(year, monthIndex, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthStart(month: string): string {
  if (!MONTH_RE.test(month)) throw new ValidationError("Month must be YYYY-MM.");
  return `${month}-01`;
}

export function monthEnd(month: string): string {
  return addDayKey(monthStart(addMonth(month, 1)), -1);
}

/** Monday-first 6-week grid covering the month, like a studio wall calendar. */
export function monthGrid(month: string): { date: string; inMonth: boolean }[] {
  const first = monthStart(month);
  const utc = new Date(`${first}T00:00:00.000Z`);
  const offset = (utc.getUTCDay() + 6) % 7;
  const start = addDayKey(first, -offset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDayKey(start, index);
    return { date, inMonth: date.startsWith(month) };
  });
}

export function weekdayLabels(): readonly string[] {
  return ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
}
