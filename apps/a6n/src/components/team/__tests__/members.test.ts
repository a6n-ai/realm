import { describe, expect, test } from "vitest";
import { filterMembers, memberStatus } from "../members";

const m = (name: string, role: string, status: string, passwordSet: boolean) => ({ name, email: `${name.toLowerCase()}@a6n.ai`, role, status, passwordSet });
const rows = [m("Ann", "admin", "active", true), m("Bo", "sales", "active", false), m("Cy", "sales", "removed", true)];

describe("members filters", () => {
  test("status: removed beats everything, an active member without a password is invited", () => {
    expect(rows.map(memberStatus)).toEqual(["active", "invited", "removed"]);
  });

  test("filters by role, status and search text together", () => {
    expect(filterMembers(rows, { role: "sales" }).map((r) => r.name)).toEqual(["Bo", "Cy"]);
    expect(filterMembers(rows, { status: "invited" }).map((r) => r.name)).toEqual(["Bo"]);
    expect(filterMembers(rows, { q: "  AN " }).map((r) => r.name)).toEqual(["Ann"]);
    expect(filterMembers(rows, { role: "sales", q: "cy@" }).map((r) => r.name)).toEqual(["Cy"]);
  });
});
