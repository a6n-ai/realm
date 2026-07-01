import { describe, expect, it } from "vitest";
import { normalizePath, parseName } from "./file-detail";

describe("parseName", () => {
  it("splits name and lowercases extension", () => {
    expect(parseName("Photo.PNG")).toEqual({ fileName: "Photo", type: "png" });
  });
  it("treats a dotless name as fileName only", () => {
    expect(parseName("noext")).toEqual({ fileName: "noext" });
  });
  it("treats a leading-dot name as fileName only (no type)", () => {
    expect(parseName(".hidden")).toEqual({ fileName: ".hidden" });
  });
  it("splits on the last dot", () => {
    expect(parseName("a.b.c")).toEqual({ fileName: "a.b", type: "c" });
  });
});

describe("normalizePath", () => {
  it("collapses double slashes", () => {
    expect(normalizePath("/a//b///c")).toBe("/a/b/c");
  });
  it("passes undefined through", () => {
    expect(normalizePath(undefined)).toBeUndefined();
  });
});
