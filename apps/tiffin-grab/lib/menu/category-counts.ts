import { z } from "zod";
import { ValidationError } from "@realm/commons";

export type CategoryCounts = Record<string, number>;

const schema = z.record(z.string().min(1), z.number().int().positive());

export function parseCategoryCounts(value: unknown): CategoryCounts {
  const r = schema.safeParse(value);
  if (!r.success) throw new ValidationError(`Invalid category counts: ${r.error.issues[0]?.message ?? "unknown"}`);
  return r.data;
}
