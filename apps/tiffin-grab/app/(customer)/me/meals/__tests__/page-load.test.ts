import { describe, expect, it } from "vitest";
import { pickPrimaryActive } from "../pick-primary-active";

describe("pickPrimaryActive", () => {
  it("returns the first active order, ignoring non-active", () => {
    expect(pickPrimaryActive([{ status: "waitlisted" }, { status: "active", publicId: "ord_2" }] as never)?.publicId).toBe("ord_2");
    expect(pickPrimaryActive([{ status: "cancelled" } as never])).toBeNull();
  });
});
