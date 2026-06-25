import { describe, it, expect } from "vitest";
import { mergeParam, dropParams } from "../use-url-state";

describe("mergeParam", () => {
  it("sets a value", () => {
    expect(mergeParam("", "stage", "new", "all")).toBe("stage=new");
  });
  it("removes the key when value equals fallback", () => {
    expect(mergeParam("stage=new&q=x", "stage", "all", "all")).toBe("q=x");
  });
  it("removes the key when value is empty", () => {
    expect(mergeParam("q=hi", "q", "", "")).toBe("");
  });
  it("preserves other params (e.g. sort)", () => {
    const out = mergeParam("sort=name&dir=asc", "owner", "Asha", "ALL");
    expect(new URLSearchParams(out).get("sort")).toBe("name");
    expect(new URLSearchParams(out).get("owner")).toBe("Asha");
  });
});

describe("dropParams", () => {
  it("removes all listed keys in one pass, preserving the rest", () => {
    const out = dropParams("q=hi&stage=new&owner=Asha&sort=name", ["q", "stage", "owner"]);
    expect(out).toBe("sort=name");
  });
  it("is a no-op for absent keys", () => {
    expect(dropParams("sort=name", ["q", "stage"])).toBe("sort=name");
  });
});
