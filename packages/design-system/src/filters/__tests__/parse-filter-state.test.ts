import { describe, it, expect } from "vitest";
import { parseFilterState, type FacetDef, DEFAULT_SIZE } from "../parse-filter-state";

const spec: FacetDef[] = [
  { kind: "pills", field: "stage", label: "Stage", options: [{ value: "won", label: "Won" }] },
  { kind: "select", field: "owner", label: "Owner", options: [] },
  { kind: "multi", field: "source", label: "Source", options: [] },
  { kind: "dateRange", field: "createdAt", label: "Created" },
  { kind: "search", fields: ["name", "phone"] },
];

describe("parseFilterState", () => {
  it("defaults: no params → no condition, page 0, default size", () => {
    const s = parseFilterState(spec, {});
    expect(s.condition).toBeUndefined();
    expect(s.page).toEqual({ page: 0, size: DEFAULT_SIZE });
    expect(s.q).toBe("");
  });

  it("pills → eq, select → eq, multi (csv) → in, date → between, search → or(like)", () => {
    const s = parseFilterState(spec, {
      stage: "won", owner: "usr_1", source: "website,google",
      from: "100", to: "200", q: "pri", page: "2", size: "50",
    });
    expect(s.q).toBe("pri");
    expect(s.page).toEqual({ page: 2, size: 50 });
    // condition is and(eq stage, eq owner, in source, between createdAt, or(like name, like phone))
    expect(s.condition?.type).toBe("complex");
    const kinds = (s.condition as any).conditions.map((c: any) => c.field ?? c.operator);
    expect(kinds).toContain("stage");
    expect(kinds).toContain("source");
    expect(kinds).toContain("createdAt");
  });

  it("clamps bad size to nearest allowed and negative page to 0", () => {
    const s = parseFilterState(spec, { size: "9999", page: "-3" });
    expect(s.page.size).toBe(100);
    expect(s.page.page).toBe(0);
  });

  it("garbage date/from-after-to is handled (swap), non-numeric ignored", () => {
    const s = parseFilterState(spec, { from: "300", to: "100" });
    const dr = (s.condition as any).conditions[0];
    expect(dr.operator).toBe("between");
    expect(dr.value).toEqual([100, 300]); // swapped
    const s2 = parseFilterState(spec, { from: "abc" });
    expect(s2.condition).toBeUndefined(); // non-numeric single bound ignored
  });

  it("empty multi value → facet dropped", () => {
    const s = parseFilterState(spec, { source: "" });
    expect(s.condition).toBeUndefined();
  });
});
