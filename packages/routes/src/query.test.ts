import { describe, expect, it } from "vitest";
import { parseListParams } from "./query";

describe("parseListParams", () => {
  it("defaults to page 0 size 10", () => {
    expect(parseListParams(new URL("http://x/api/r"))).toMatchObject({ page: 0, size: 10 });
  });
  it("reads page/size/sort/dir", () => {
    const p = parseListParams(new URL("http://x/api/r?page=2&size=25&sort=label&dir=desc"));
    expect(p).toEqual({ page: 2, size: 25, sort: { field: "label", dir: "desc" } });
  });
});
