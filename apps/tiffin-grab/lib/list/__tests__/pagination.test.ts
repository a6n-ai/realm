import { describe, expect, it } from "vitest";
import { pageOffset, parsePagination } from "../pagination";

const sp = (q: string) => new URLSearchParams(q);

describe("parsePagination", () => {
  it("defaults", () => expect(parsePagination(sp(""))).toEqual({ page: 0, size: 25 }));
  it("reads page and an allowed size", () => expect(parsePagination(sp("page=3&size=50"))).toEqual({ page: 3, size: 50 }));
  it("clamps a negative or junk page to 0 and an unlisted size to the default", () => {
    expect(parsePagination(sp("page=-2&size=7"))).toEqual({ page: 0, size: 25 });
    expect(parsePagination(sp("page=x"))).toEqual({ page: 0, size: 25 });
  });
});

describe("pageOffset", () => {
  it("multiplies", () => expect(pageOffset(3, 25)).toBe(75));
});
