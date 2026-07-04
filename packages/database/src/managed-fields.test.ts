import { describe, expect, it } from "vitest";
import { stripCreateOnly, stripManaged } from "./managed-fields";

describe("stripManaged", () => {
  it("removes identity and audit fields, keeps domain fields", () => {
    const out = stripManaged({
      id: "evil",
      createdAt: new Date(),
      createdBy: "evil",
      updatedAt: new Date(),
      updatedBy: "evil",
      key: "k",
      label: "L",
    });
    expect(out).toEqual({ key: "k", label: "L" });
  });
});

describe("stripCreateOnly", () => {
  it("removes only createdAt/createdBy, keeps updatedBy and domain fields", () => {
    const out = stripCreateOnly({ createdAt: new Date(), createdBy: "x", updatedBy: "y", label: "L" });
    expect(out).toEqual({ updatedBy: "y", label: "L" });
  });
});
