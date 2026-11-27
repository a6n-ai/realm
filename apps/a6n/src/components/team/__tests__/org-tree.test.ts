import { describe, expect, test } from "vitest";
import { buildOrgTree } from "../org-tree";

const p = (id: string, manager: string | null = null) => ({ userId: `u_${id}`, memberId: id, name: id, role: "member", managerMemberId: manager, teams: [] });

describe("buildOrgTree", () => {
  test("nests reports under their manager; lone people are unplaced", () => {
    const { roots, unplaced } = buildOrgTree([p("a"), p("b", "a"), p("c", "b"), p("d", "a"), p("z")]);
    expect(roots.map((r) => r.memberId)).toEqual(["a"]);
    expect(roots[0]!.reports.map((r) => r.memberId)).toEqual(["b", "d"]);
    expect(roots[0]!.reports[0]!.reports.map((r) => r.memberId)).toEqual(["c"]);
    expect(unplaced.map((r) => r.memberId)).toEqual(["z"]);
  });

  test("a manager that is not in the list makes the person a root", () => {
    const { roots, unplaced } = buildOrgTree([p("b", "gone"), p("c", "b")]);
    expect(roots.map((r) => r.memberId)).toEqual(["b"]);
    expect(unplaced).toEqual([]);
  });
});
