import { describe, it, expect } from "vitest";
import { parseSort, sortRows } from "../sort";

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

describe("sortRows", () => {
  const rows = [{ n: "wc-15720", c: 3 }, { n: "", c: 10 }, { n: "wc-9", c: 1 }];
  const value = (r: (typeof rows)[number], col: "n" | "c") => r[col];
  it("sorts strings numerically and keeps blanks last", () => {
    expect(sortRows(rows, { column: "n", dir: "asc" }, value).map((r) => r.n)).toEqual(["wc-9", "wc-15720", ""]);
    expect(sortRows(rows, { column: "n", dir: "desc" }, value).map((r) => r.n)).toEqual(["wc-15720", "wc-9", ""]);
  });
  it("sorts numbers by value, not text", () => {
    expect(sortRows(rows, { column: "c", dir: "desc" }, value).map((r) => r.c)).toEqual([10, 3, 1]);
  });
  it("does not mutate the input", () => {
    sortRows(rows, { column: "c", dir: "asc" }, value);
    expect(rows[0].c).toBe(3);
  });
});
