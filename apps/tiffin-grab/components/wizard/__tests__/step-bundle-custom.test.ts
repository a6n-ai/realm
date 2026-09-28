import { describe, expect, it } from "vitest";
import { listableMealSizes } from "@/lib/catalog/types";

const sizes = [
  { publicId: "a", custom: false },
  { publicId: "c1", custom: true },
  { publicId: "c2", custom: true },
];

describe("wizard meal list", () => {
  it("public wizard shows no custom sizes", () => expect(listableMealSizes(sizes).map((s) => s.publicId)).toEqual(["a"]));
  it("renew shows only the customer's own custom size", () => expect(listableMealSizes(sizes, "c2").map((s) => s.publicId)).toEqual(["a", "c2"]));
});
