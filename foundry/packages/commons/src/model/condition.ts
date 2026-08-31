export type FilterOperator = "eq" | "in" | "like" | "gt" | "gte" | "lt" | "lte" | "between";

export interface FilterCondition {
  type: "filter";
  field: string;
  operator: FilterOperator;
  value: unknown;
}

export interface ComplexCondition {
  type: "complex";
  operator: "and" | "or";
  conditions: Condition[];
}

export type Condition = FilterCondition | ComplexCondition;

const filter = (field: string, operator: FilterOperator, value: unknown): FilterCondition => ({
  type: "filter",
  field,
  operator,
  value,
});

export const eq = (field: string, value: unknown) => filter(field, "eq", value);
export const inList = (field: string, values: unknown[]) => filter(field, "in", values);
export const like = (field: string, value: string) => filter(field, "like", value);
export const gt = (field: string, value: unknown) => filter(field, "gt", value);
export const gte = (field: string, value: unknown) => filter(field, "gte", value);
export const lt = (field: string, value: unknown) => filter(field, "lt", value);
export const lte = (field: string, value: unknown) => filter(field, "lte", value);
export const between = (field: string, a: unknown, b: unknown) => filter(field, "between", [a, b]);

export const and = (...conditions: Condition[]): ComplexCondition => ({ type: "complex", operator: "and", conditions });
export const or = (...conditions: Condition[]): ComplexCondition => ({ type: "complex", operator: "or", conditions });
