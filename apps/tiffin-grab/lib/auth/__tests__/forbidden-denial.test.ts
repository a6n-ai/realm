import { describe, expect, it } from "vitest";
import { AuthError, ForbiddenError, NotFoundError } from "@foundry/commons";
import { isForbiddenDenial } from "../forbidden-denial";

describe("isForbiddenDenial", () => {
  it("is true only for a permission denial", () => {
    expect(isForbiddenDenial(new ForbiddenError())).toBe(true);
    expect(isForbiddenDenial(new ForbiddenError("nope"))).toBe(true);
  });

  it("leaves sign-in and other failures to their own handling", () => {
    expect(isForbiddenDenial(new AuthError())).toBe(false);
    expect(isForbiddenDenial(new NotFoundError())).toBe(false);
    expect(isForbiddenDenial(new Error("boom"))).toBe(false);
    expect(isForbiddenDenial(null)).toBe(false);
  });
});
