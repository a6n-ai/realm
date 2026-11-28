import { describe, expect, test } from "vitest";
import { findEntries } from "../find";
import { builtInPermissions } from "../../../lib/auth/permissions";
const p = (r: "admin" | "sales" | "owner" | "member") => builtInPermissions(r === "sales" ? "member" : r);

describe("findEntries", () => {
  test("a sales user finds the inquiry pages, Settings, Account settings and New inquiry only", () => {
    const e = findEntries(p("sales"));
    expect(e.map((x) => x.label)).toEqual(["Inquiries", "Unassigned", "Docs", "Settings", "Account settings", "New inquiry"]);
    expect(e.find((x) => x.label === "Unassigned")?.to).toBe("/inquiries?view=unassigned");
  });

  test("an admin also finds Sources and the admin actions, not Team", () => {
    const labels = findEntries(p("admin")).map((x) => x.label);
    expect(labels).toEqual(expect.arrayContaining(["Sources", "Invite member", "New source"]));
    expect(labels).not.toContain("Team");
  });

  test("actions carry a create kind, pages a path", () => {
    const e = findEntries(p("admin"));
    expect(e.filter((x) => x.group === "Actions").every((x) => x.create && !x.to)).toBe(true);
    expect(e.filter((x) => x.group === "Pages").every((x) => x.to && !x.create)).toBe(true);
  });
});
