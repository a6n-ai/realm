import { describe, expect, it } from "vitest";
import { makePublicId } from "./columns";

describe("makePublicId", () => {
  it("produces <prefix>_<12-char nanoid>", () => {
    const gen = makePublicId("usr");
    const id = gen();
    expect(id).toMatch(/^usr_[A-Za-z0-9_-]{12}$/);
  });

  it("generates unique values", () => {
    const gen = makePublicId("ord");
    const ids = new Set(Array.from({ length: 1000 }, () => gen()));
    expect(ids.size).toBe(1000);
  });

  it("rejects a non-3-letter prefix", () => {
    expect(() => makePublicId("user")).toThrow();
    expect(() => makePublicId("us")).toThrow();
  });
});
