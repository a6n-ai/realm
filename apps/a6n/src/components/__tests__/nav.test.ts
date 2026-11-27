import { describe, expect, test } from "vitest";
import { createItems, visibleNav } from "../nav";

const labels = (role: "admin" | "sales") => visibleNav(role, { total: 3, overdue: 1 }).flatMap((g) => g.items.map((i) => i.label));

describe("visibleNav", () => {
  test("a sales user has no Sources item", () => {
    expect(labels("sales")).toEqual(["Inquiries", "Unassigned", "Settings"]);
  });

  test("an admin has Sources and Settings but no Team item", () => {
    expect(labels("admin")).toEqual(["Inquiries", "Unassigned", "Sources", "Settings"]);
  });

  test("the Unassigned badge is the plain total, overdue or not", () => {
    for (const overdue of [0, 1]) {
      const item = visibleNav("sales", { total: 3, overdue })[0]!.items.find((i) => i.label === "Unassigned");
      expect(item?.badge).toBe("3");
    }
  });
});

describe("createItems", () => {
  test("sales can only start an inquiry; an admin can also invite and add a source", () => {
    expect(createItems("sales").map((c) => c.kind)).toEqual(["inquiry"]);
    expect(createItems("admin").map((c) => c.kind)).toEqual(["inquiry", "invite", "source"]);
  });
});
