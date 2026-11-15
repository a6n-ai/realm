import { describe, expect, it } from "vitest";
import type { Condition } from "@foundry/commons/model/condition";
import { matchesCondition } from "../member-filter";
import type { MemberRow } from "../members-query";

const row = (orgRole: string) => ({ orgRole, passwordSet: true }) as MemberRow;
const eqRole = (value: string): Condition => ({ type: "filter", field: "role", operator: "eq", value }) as Condition;
const inRoles = (value: string[]): Condition => ({ type: "filter", field: "role", operator: "in", value }) as Condition;

describe("matchesCondition role filter", () => {
  it("matches a person holding several roles on eq", () => {
    expect(matchesCondition(row("admin,kitchen"), eqRole("kitchen"))).toBe(true);
    expect(matchesCondition(row("admin,kitchen"), eqRole("admin"))).toBe(true);
    expect(matchesCondition(row("admin,kitchen"), eqRole("owner"))).toBe(false);
  });

  it("matches when any selected role is in the comma list on in", () => {
    expect(matchesCondition(row("admin,kitchen"), inRoles(["owner", "kitchen"]))).toBe(true);
    expect(matchesCondition(row("admin,kitchen"), inRoles(["owner", "viewer"]))).toBe(false);
  });
});
