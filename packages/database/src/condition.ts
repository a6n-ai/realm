import type { Condition, FilterCondition } from "@realm/commons";
import { ValidationError } from "@realm/commons";
import {
  and,
  eq,
  gt,
  gte,
  inArray,
  ilike,
  lt,
  lte,
  or,
  type SQL,
} from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

export function resolveColumn(table: PgTable, field: string): PgColumn {
  const col = (table as unknown as Record<string, PgColumn>)[field];
  if (!col) throw new ValidationError(`Unknown field: ${field}`);
  return col;
}

export type FilterResolver = (f: FilterCondition) => SQL | undefined;

export function conditionToSql(
  condition: Condition | undefined,
  resolve: FilterResolver,
): SQL | undefined {
  if (!condition) return undefined;
  if (condition.type === "complex") {
    const parts = condition.conditions
      .map((c) => conditionToSql(c, resolve))
      .filter((s): s is SQL => Boolean(s));
    if (parts.length === 0) return undefined;
    return condition.operator === "and" ? and(...parts) : or(...parts);
  }
  return resolve(condition);
}

// Default resolver: field name → column, generic operator translation.
export function columnResolver(map: Record<string, PgColumn>): FilterResolver {
  return (f) => {
    const col = map[f.field];
    if (!col) throw new ValidationError(`Unknown field: ${f.field}`);
    switch (f.operator) {
      case "eq":
        return eq(col, f.value);
      case "in": {
        const vals = f.value as unknown[];
        return vals.length ? inArray(col, vals) : undefined;
      }
      case "like":
        return ilike(col, f.value as string);
      case "gt":
        return gt(col, f.value);
      case "gte":
        return gte(col, f.value);
      case "lt":
        return lt(col, f.value);
      case "lte":
        return lte(col, f.value);
      case "between": {
        const [a, b] = f.value as [unknown, unknown];
        return and(gte(col, a), lte(col, b));
      }
    }
  };
}

// Existing single-table API, now built on the pieces above. Preserves behavior.
export function toDrizzleWhere(table: PgTable, condition?: Condition): SQL | undefined {
  const cols = table as unknown as Record<string, PgColumn>;
  return conditionToSql(condition, columnResolver(cols));
}
