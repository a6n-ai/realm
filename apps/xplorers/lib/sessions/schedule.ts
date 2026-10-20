import { ValidationError } from "@foundry/commons";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDay(value: unknown): string {
  const trimmed = String(value ?? "").trim();
  if (!DATE_RE.test(trimmed)) throw new ValidationError("Pick a calendar day.");
  return trimmed;
}

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
