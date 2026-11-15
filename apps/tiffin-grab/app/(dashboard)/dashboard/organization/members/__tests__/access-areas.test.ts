import { describe, expect, it } from "vitest";
import type { ResourceLabel } from "@foundry/crm";
import { hasFullAccess, heldAreas } from "../access-areas";
import { matchesCondition, type FilterableMember } from "../member-filter";
import type { Condition } from "@foundry/commons/model/condition";

const resources: ResourceLabel[] = [
  { resource: "menu", label: "Menu", actions: [{ action: "read", label: "View" }, { action: "update", label: "Edit" }] },
  { resource: "order", label: "Orders", actions: [{ action: "read", label: "View" }] },
];

describe("heldAreas", () => {
  it("lists areas with at least one action, in resource order", () => {
    expect(heldAreas({ order: ["read"], menu: ["read"] }, resources).map((a) => a.label)).toEqual(["Menu", "Orders"]);
    expect(heldAreas({ menu: ["update"] }, resources).map((a) => a.resource)).toEqual(["menu"]);
  });

  it("is empty for no permissions", () => {
    expect(heldAreas({}, resources)).toEqual([]);
  });
});

describe("hasFullAccess", () => {
  it("is true only when every action in every area is held", () => {
    expect(hasFullAccess({ menu: ["read", "update"], order: ["read"] }, resources)).toBe(true);
    expect(hasFullAccess({ menu: ["read"], order: ["read"] }, resources)).toBe(false);
    expect(hasFullAccess({}, [])).toBe(false);
  });
});

describe("matchesCondition area filter", () => {
  const person = { orgRole: "kitchen", passwordSet: true, areaIds: ["menu"] } as FilterableMember;
  const area = (value: string[]): Condition => ({ type: "filter", field: "area", operator: "in", value }) as Condition;

  it("matches people holding any action in a selected area", () => {
    expect(matchesCondition(person, area(["order", "menu"]))).toBe(true);
    expect(matchesCondition(person, area(["order"]))).toBe(false);
  });
});
