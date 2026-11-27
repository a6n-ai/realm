import { describe, expect, test } from "vitest";
import { findEntries } from "../find";

describe("findEntries", () => {
  test("a sales user finds the inquiry pages, Settings and New inquiry only", () => {
    const e = findEntries("sales");
    expect(e.map((x) => x.label)).toEqual(["Inquiries", "Unassigned", "Settings", "New inquiry"]);
    expect(e.find((x) => x.label === "Unassigned")?.to).toBe("/inquiries?view=unassigned");
  });

  test("an admin also finds Team, Sources and their actions", () => {
    const labels = findEntries("admin").map((x) => x.label);
    expect(labels).toEqual(expect.arrayContaining(["Team", "Sources", "Invite member", "New source"]));
  });

  test("actions carry a create kind, pages a path", () => {
    const e = findEntries("admin");
    expect(e.filter((x) => x.group === "Actions").every((x) => x.create && !x.to)).toBe(true);
    expect(e.filter((x) => x.group === "Pages").every((x) => x.to && !x.create)).toBe(true);
  });
});
