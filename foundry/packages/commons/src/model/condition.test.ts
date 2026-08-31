import { describe, expect, it } from "vitest";
import { and, between, eq, inList, or } from "./condition";

describe("condition builders", () => {
  it("builds a filter condition", () => {
    expect(eq("status", "active")).toEqual({ type: "filter", field: "status", operator: "eq", value: "active" });
  });
  it("builds a between condition with a tuple value", () => {
    expect(between("kcal", 500, 900)).toEqual({ type: "filter", field: "kcal", operator: "between", value: [500, 900] });
  });
  it("nests complex conditions", () => {
    const c = and(eq("role", "user"), or(inList("zone", ["A", "B"]), eq("active", true)));
    expect(c.type).toBe("complex");
    expect(c).toMatchObject({ operator: "and" });
    expect((c as { conditions: { operator: string }[] }).conditions[1].operator).toBe("or");
  });
});
