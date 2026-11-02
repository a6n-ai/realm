import { describe, expect, it } from "vitest";
import { franchiseFacets } from "../franchise-facet";

const org = (n: number) => ({ value: `org${n}`, label: `Franchise ${n}` });

describe("franchiseFacets", () => {
  it("is hidden when the viewer sees no franchise or just one", () => {
    expect(franchiseFacets([])).toEqual([]);
    expect(franchiseFacets([org(1)])).toEqual([]);
  });

  it("lists exactly the visible franchises once there are two or more", () => {
    const facets = franchiseFacets([org(1), org(2), org(3)]);
    expect(facets).toHaveLength(1);
    expect(facets[0]).toMatchObject({ kind: "multi", field: "org", label: "Franchise" });
    expect((facets[0] as { options: unknown[] }).options).toEqual([org(1), org(2), org(3)]);
  });
});
