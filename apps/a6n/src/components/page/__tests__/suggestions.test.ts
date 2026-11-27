import { describe, expect, test } from "vitest";
import { suggestionsFor } from "../suggestions";

const facets = [
  { key: "stage", label: "Stage", options: [{ value: "new", label: "New" }, { value: "won", label: "Won" }] },
  { key: "owner", label: "Owner", options: [{ value: "u1", label: "Ann" }, { value: "u2", label: "Bo" }] },
  { key: "source", label: "Source", options: [] },
];

describe("suggestionsFor", () => {
  test("suggests the first option of each unfiltered facet; none for an empty facet", () => {
    expect(suggestionsFor(facets, {}).map((s) => [s.key, s.value])).toEqual([["stage", "new"], ["owner", "u1"]]);
  });

  test("a preferred option wins when it exists", () => {
    expect(suggestionsFor(facets, {}, { owner: "u2" }).find((s) => s.key === "owner")?.valueLabel).toBe("Bo");
    expect(suggestionsFor(facets, {}, { owner: "nope" }).find((s) => s.key === "owner")?.value).toBe("u1");
  });

  test("a facet already in the URL is not suggested again", () => {
    expect(suggestionsFor(facets, { stage: "won" }).map((s) => s.key)).toEqual(["owner"]);
  });
});
