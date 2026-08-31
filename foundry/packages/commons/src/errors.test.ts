import { describe, expect, it } from "vitest";
import { AuthError, NotFoundError, ValidationError } from "./errors";

describe("app errors", () => {
  it("carries an HTTP status", () => {
    expect(new NotFoundError("x").status).toBe(404);
    expect(new ValidationError("x").status).toBe(400);
    expect(new AuthError("x").status).toBe(401);
  });
});
