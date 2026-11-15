import { describe, expect, it } from "vitest";
import { RESOURCE_LABELS, appStatement } from "../permissions";
import { PERMISSION_GROUPS, groupOfResource, groupResources } from "../permission-groups";

const listed = PERMISSION_GROUPS.flatMap((g) => g.resources);

describe("PERMISSION_GROUPS", () => {
  it("lists every permission resource exactly once", () => {
    for (const resource of [...Object.keys(appStatement), ...RESOURCE_LABELS.map((r) => r.resource)]) {
      expect(listed.filter((r) => r === resource)).toHaveLength(1);
    }
    expect(new Set(listed).size).toBe(listed.length);
  });

  it("resolves every resource to its own group", () => {
    for (const group of PERMISSION_GROUPS) {
      for (const resource of group.resources) expect(groupOfResource(resource)).toBe(group);
    }
  });

  it("sends unknown resources to Team & settings", () => {
    expect(groupOfResource("not-a-resource").key).toBe("team");
  });

  it("groups items in group order and drops empty groups", () => {
    const grouped = groupResources([{ resource: "staff" }, { resource: "order" }, { resource: "menu" }]);
    expect(grouped.map((g) => g.group.key)).toEqual(["operations", "menu", "team"]);
  });
});
