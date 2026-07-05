import { NotFoundError, ValidationError } from "@realm/commons";
import { describe, expect, it } from "vitest";
import { toResponse } from "./error-mapper";

describe("toResponse", () => {
  it("maps AppError to a problem+json body", async () => {
    const res = toResponse(new NotFoundError("nope"));
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toBe("application/problem+json");
    expect(await res.json()).toEqual({ type: "about:blank", title: "Not Found", status: 404, detail: "nope" });
  });
  it("maps ValidationError to 400", () => {
    expect(toResponse(new ValidationError("bad")).status).toBe(400);
  });
  it("maps unknown errors to 500", () => {
    expect(toResponse(new Error("boom")).status).toBe(500);
  });
});
