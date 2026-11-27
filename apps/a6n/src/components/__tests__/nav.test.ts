import { describe, expect, test } from "vitest";
import { createItems, visibleNav } from "../nav";

const labels = (role: "admin" | "sales") => visibleNav(role, { total: 3, overdue: 1 }).flatMap((g) => g.items.map((i) => i.label));

describe("visibleNav", () => {
  test("a sales user has no Team or Sources item", () => {
    expect(labels("sales")).toEqual(["Inquiries", "Unassigned", "Settings"]);
  });

  test("an admin has both, and Team opens the members settings", () => {
    expect(labels("admin")).toEqual(expect.arrayContaining(["Team", "Sources", "Settings"]));
    const team = visibleNav("admin", { total: 0, overdue: 0 }).flatMap((g) => g.items).find((i) => i.label === "Team");
    expect(team?.to).toBe("/settings/members");
  });

  test("the Unassigned badge shows the total and the overdue count", () => {
    const item = visibleNav("sales", { total: 3, overdue: 1 })[0]!.items.find((i) => i.label === "Unassigned");
    expect(item?.badge).toBe("3 · 1 overdue");
  });

  test("the badge is the bare total when nothing is overdue", () => {
    const item = visibleNav("sales", { total: 2, overdue: 0 })[0]!.items.find((i) => i.label === "Unassigned");
    expect(item?.badge).toBe("2");
  });
});

describe("createItems", () => {
  test("sales can only start an inquiry; an admin can also invite and add a source", () => {
    expect(createItems("sales").map((c) => c.kind)).toEqual(["inquiry"]);
    expect(createItems("admin").map((c) => c.kind)).toEqual(["inquiry", "invite", "source"]);
  });
});
