import type { Condition } from "@foundry/commons/model/condition";
import type { MemberRow } from "./members-query";

/** `areaIds` holds the resource ids the person has any action in (see access-areas.ts). */
export type FilterableMember = MemberRow & { areaIds?: string[] };

export function matchesCondition(row: FilterableMember, condition: Condition): boolean {
  if (condition.type === "complex") {
    return condition.operator === "and"
      ? condition.conditions.every((c) => matchesCondition(row, c))
      : condition.conditions.some((c) => matchesCondition(row, c));
  }
  if (condition.field === "password") return condition.value === "unset" ? !row.passwordSet : row.passwordSet;
  // Multi-valued fields: a person matches when they hold any one of the selected values.
  if ((condition.field === "role" || condition.field === "area") && (condition.operator === "eq" || condition.operator === "in")) {
    const held = condition.field === "role" ? row.orgRole.split(",").map((r) => r.trim()) : (row.areaIds ?? []);
    return condition.operator === "eq"
      ? held.includes(String(condition.value))
      : (condition.value as unknown[]).some((v) => held.includes(String(v)));
  }
  const value = condition.field === "role" ? row.orgRole : row[condition.field as keyof MemberRow];
  switch (condition.operator) {
    case "eq":
      return value === condition.value;
    case "in":
      return (condition.value as unknown[]).includes(value);
    case "like": {
      const needle = String(condition.value).replace(/%/g, "").toLowerCase();
      return String(value ?? "").toLowerCase().includes(needle);
    }
    default:
      return true;
  }
}
