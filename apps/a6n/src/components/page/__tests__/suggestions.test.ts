import { describe, expect, test } from "vitest";
import { chipsFrom, withoutKey } from "@foundry/console/filters";
import { listInquiriesSchema } from "../../../lib/inquiries/schemas";
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

describe("Follow-up Due chip", () => {
  const due = { key: "due", label: "Follow-up", options: [{ value: "1", label: "Due" }] };

  test("is suggested, becomes ?due=1, shows as a chip, and removing it clears the param", () => {
    const [s] = suggestionsFor([due], {});
    expect([s?.label, s?.valueLabel]).toEqual(["Follow-up", "Due"]);
    const next = { stage: "new", [s!.key]: s!.value };
    expect(chipsFrom(next, [due])).toEqual([{ key: "due", label: "Follow-up", valueLabel: "Due" }]);
    expect(suggestionsFor([due], next)).toEqual([]);
    expect(withoutKey(next, "due")).toEqual({ stage: "new" });
  });

  test("the list schema accepts due=1 and rejects other values", () => {
    expect(listInquiriesSchema.parse({ due: "1" }).due).toBe("1");
    expect(listInquiriesSchema.safeParse({ due: "0" }).success).toBe(false);
  });
});
