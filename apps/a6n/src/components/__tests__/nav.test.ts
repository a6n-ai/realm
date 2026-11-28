import { describe, expect, test } from "vitest";
import { createItems, visibleNav } from "../nav";
import { builtInPermissions } from "../../lib/auth/permissions";
const p = (r: "admin" | "sales" | "owner" | "member") => builtInPermissions(r === "sales" ? "member" : r);

const labels = (role: "admin" | "sales") => visibleNav(p(role), { total: 3, overdue: 1 }).flatMap((g) => g.items.map((i) => i.label));

describe("visibleNav", () => {
  test("a sales user has no Sources item", () => {
    expect(labels("sales")).toEqual(["Inquiries", "Unassigned", "Docs", "Settings"]);
  });

  test("an admin has Sources and Settings but no Team item", () => {
    expect(labels("admin")).toEqual(["Inquiries", "Unassigned", "Docs", "Sources", "Settings"]);
  });

  test("the Unassigned badge is the plain total, overdue or not", () => {
    for (const overdue of [0, 1]) {
      const item = visibleNav(p("sales"), { total: 3, overdue })[0]!.items.find((i) => i.label === "Unassigned");
      expect(item?.badge).toBe("3");
    }
  });
});

test("the Unassigned badge is hidden when nothing is unassigned", () => {
  const item = visibleNav(p("sales"), { total: 0, overdue: 0 })[0]!.items.find((i) => i.label === "Unassigned");
  expect(item).toBeDefined();
  expect(item?.badge).toBeUndefined();
});

describe("createItems", () => {
  test("sales can only start an inquiry; an admin can also invite and add a source", () => {
    expect(createItems(p("sales")).map((c) => c.kind)).toEqual(["inquiry"]);
    expect(createItems(p("admin")).map((c) => c.kind)).toEqual(["inquiry", "invite", "source"]);
  });
});

test("only a super admin sees Organisations", () => {
  const names = (admin: boolean) => visibleNav(p("owner"), { total: 0, overdue: 0 }, admin).flatMap((g) => g.items.map((i) => i.label));
  expect(names(false)).not.toContain("Organisations");
  expect(names(true)).toContain("Organisations");
});

test("every member has Docs, whatever their permissions", () => {
  expect(visibleNav([], { total: 0, overdue: 0 }).flatMap((g) => g.items)).toContainEqual(expect.objectContaining({ label: "Docs", to: "/docs" }));
});
