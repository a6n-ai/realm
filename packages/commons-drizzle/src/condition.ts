import type { Condition } from "@tiffin/commons";
import {
  and as dAnd,
  between as dBetween,
  eq as dEq,
  gt as dGt,
  gte as dGte,
  inArray,
  like as dLike,
  lt as dLt,
  lte as dLte,
  or as dOr,
  type SQL,
} from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

function column(table: PgTable, field: string): PgColumn {
  const col = (table as unknown as Record<string, PgColumn>)[field];
  if (!col) throw new Error(`Unknown field: ${field}`);
  return col;
}

export function toDrizzleWhere(table: PgTable, condition?: Condition): SQL | undefined {
  if (!condition) return undefined;

  if (condition.type === "complex") {
    const parts = condition.conditions
      .map((c) => toDrizzleWhere(table, c))
      .filter((p): p is SQL => p !== undefined);
    if (parts.length === 0) return undefined;
    return condition.operator === "and" ? dAnd(...parts) : dOr(...parts);
  }

  const col = column(table, condition.field);
  const v = condition.value;
  switch (condition.operator) {
    case "eq": return dEq(col, v);
    case "in": return inArray(col, v as unknown[]);
    case "like": return dLike(col, v as string);
    case "gt": return dGt(col, v);
    case "gte": return dGte(col, v);
    case "lt": return dLt(col, v);
    case "lte": return dLte(col, v);
    case "between": {
      const [a, b] = v as [unknown, unknown];
      return dBetween(col, a, b);
    }
  }
}
