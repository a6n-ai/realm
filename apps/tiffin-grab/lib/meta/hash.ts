import { createHash } from "node:crypto";

/** SHA-256 hex of a non-empty normalized string. Empty/whitespace → undefined (never hash blanks). */
export function hashMetaField(normalized: string | null | undefined): string | undefined {
  const v = normalized?.trim();
  if (!v) return undefined;
  return createHash("sha256").update(v).digest("hex");
}

export function normalizeEmail(raw: string | null | undefined): string | undefined {
  const v = raw?.trim().toLowerCase();
  return v || undefined;
}

/** Digits only; prepends Canadian country code `1` for bare 10-digit numbers. */
export function normalizePhone(raw: string | null | undefined): string | undefined {
  if (!raw?.trim()) return undefined;
  let digits = raw.replace(/\D/g, "");
  if (!digits) return undefined;
  if (digits.length === 10) digits = `1${digits}`;
  return digits;
}

export function normalizeNamePart(raw: string | null | undefined): string | undefined {
  const v = raw?.trim().toLowerCase();
  return v || undefined;
}

export function normalizeCity(raw: string | null | undefined): string | undefined {
  const v = raw?.trim().toLowerCase().replace(/\s+/g, "");
  return v || undefined;
}

/** Two-letter province/state code, lowercase (e.g. "on"). */
export function normalizeProvince(raw: string | null | undefined): string | undefined {
  const v = raw?.trim().toLowerCase().replace(/[^a-z]/g, "");
  return v && v.length === 2 ? v : undefined;
}

export function normalizePostal(raw: string | null | undefined): string | undefined {
  const v = raw?.trim().toLowerCase().replace(/\s+/g, "");
  return v || undefined;
}

/** Split "First Last …" into fn / ln for Meta. */
export function splitPersonName(fullName: string | null | undefined): { fn?: string; ln?: string } {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { fn: normalizeNamePart(parts[0]) };
  return {
    fn: normalizeNamePart(parts[0]),
    ln: normalizeNamePart(parts.slice(1).join(" ")),
  };
}
