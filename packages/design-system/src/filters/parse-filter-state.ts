import {
  and, or, eq, inList, like, between, gte, lte,
  type Condition,
} from "@realm/commons/model/condition";
import type { PageRequest } from "@realm/commons/util/pagination";
export type { FacetDef, Option } from "./facet";
import type { FacetDef } from "./facet";

export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_SIZE = 25;

export type FilterState = { condition: Condition | undefined; page: PageRequest; q: string };

const num = (v: string | undefined): number | undefined => {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

function clampSize(v: string | undefined, sizes: readonly number[], dflt: number): number {
  const n = num(v);
  if (n == null) return dflt;
  // nearest allowed
  return sizes.includes(n) ? n : sizes.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a));
}

export function parseFilterState(
  spec: FacetDef[],
  sp: Record<string, string | undefined>,
  opts?: { sizes?: readonly number[]; defaultSize?: number },
): FilterState {
  const sizes = opts?.sizes ?? PAGE_SIZES;
  const defaultSize = opts?.defaultSize ?? DEFAULT_SIZE;
  const parts: Condition[] = [];
  let q = "";

  for (const f of spec) {
    if (f.kind === "search") {
      q = sp.q?.trim() ?? "";
      if (q) parts.push(or(...f.fields.map((field) => like(field, `%${q}%`))));
      continue;
    }
    if (f.kind === "dateRange") {
      const a = num(sp.from);
      const b = num(sp.to);
      if (a != null && b != null) parts.push(between(f.field, Math.min(a, b), Math.max(a, b)));
      else if (a != null) parts.push(gte(f.field, a));
      else if (b != null) parts.push(lte(f.field, b));
      continue;
    }
    const raw = sp[f.field];
    if (!raw) continue;
    if (f.kind === "pills" || f.kind === "select") {
      parts.push(eq(f.field, raw));
    } else if (f.kind === "multi") {
      const vals = raw.split(",").map((s) => s.trim()).filter(Boolean);
      if (vals.length) parts.push(inList(f.field, vals));
    }
  }

  const page = Math.max(0, Math.trunc(num(sp.page) ?? 0));
  return {
    condition: parts.length ? and(...parts) : undefined,
    page: { page, size: clampSize(sp.size, sizes, defaultSize) },
    q,
  };
}
