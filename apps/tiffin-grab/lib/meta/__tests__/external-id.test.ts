import { describe, expect, it } from "vitest";
import { dedupeExternalId, metaExternalIdFromCookie } from "../external-id";

describe("meta external id", () => {
  it("accepts only UUID cookie values", () => {
    expect(metaExternalIdFromCookie("550e8400-e29b-41d4-a716-446655440000")).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(metaExternalIdFromCookie("usr_1")).toBeUndefined();
    expect(metaExternalIdFromCookie("")).toBeUndefined();
    expect(metaExternalIdFromCookie(null)).toBeUndefined();
  });

  it("prefers the Pixel cookie over an account id", () => {
    expect(
      dedupeExternalId("550e8400-e29b-41d4-a716-446655440000", "usr_1"),
    ).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(dedupeExternalId(null, "usr_1")).toBe("usr_1");
    expect(dedupeExternalId("not-a-uuid", "usr_1")).toBe("usr_1");
  });
});
