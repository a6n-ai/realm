import { describe, expect, test } from "vitest";
import { visibleNav } from "../nav";

const labels = (role: "admin" | "sales") => visibleNav(role, { total: 3, overdue: 1 }).flatMap((g) => g.items.map((i) => i.label));

describe("visibleNav", () => {
  test("a sales user has no Team or Sources item", () => {
    expect(labels("sales")).toEqual(["Inquiries", "Unassigned"]);
  });

  test("an admin has both", () => {
    expect(labels("admin")).toEqual(expect.arrayContaining(["Team", "Sources"]));
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
