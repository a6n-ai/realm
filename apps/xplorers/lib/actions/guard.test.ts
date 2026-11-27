import { describe, expect, it, vi } from "vitest";
import { NotFoundError, ValidationError } from "@foundry/commons";
import { redirect } from "next/navigation";
import { attempt } from "./guard";

describe("attempt", () => {
  it("returns the value", async () => {
    expect(await attempt(async () => 1)).toEqual({ value: 1 });
  });

  it("turns ValidationError and NotFoundError into { error }", async () => {
    expect(await attempt(async () => { throw new ValidationError("bad"); })).toEqual({ error: "bad" });
    expect(await attempt(async () => { throw new NotFoundError("gone"); })).toEqual({ error: "gone" });
  });

  it("rethrows anything else without a fallback", async () => {
    await expect(attempt(async () => { throw new Error("boom"); })).rejects.toThrow("boom");
  });

  it("logs anything else and returns the fallback when given one", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await attempt(async () => { throw new Error("boom"); }, "Could not save")).toEqual({ error: "Could not save" });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("still rethrows a redirect when a fallback is given", async () => {
    await expect(attempt(async () => redirect("/x"), "Could not save")).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_REDIRECT/) });
  });
});
