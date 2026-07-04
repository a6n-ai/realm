import { describe, it, expect } from "vitest";
import { parseSort } from "../sort";

const allowed = ["name", "created"] as const;
const fb = { column: "created", dir: "desc" } as const;

describe("parseSort", () => {
  it("returns fallback when sort missing", () => {
    expect(parseSort({}, allowed, fb)).toEqual(fb);
  });
  it("rejects a non-whitelisted column", () => {
    expect(parseSort({ sort: "password); drop table", dir: "asc" }, allowed, fb)).toEqual(fb);
  });
  it("accepts a whitelisted column + dir", () => {
    expect(parseSort({ sort: "name", dir: "asc" }, allowed, fb)).toEqual({ column: "name", dir: "asc" });
  });
  it("defaults dir to asc for an unknown dir", () => {
    expect(parseSort({ sort: "name", dir: "sideways" }, allowed, fb)).toEqual({ column: "name", dir: "asc" });
  });
});
