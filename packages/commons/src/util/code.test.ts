import { describe, expect, it } from "vitest";
import { generateCode } from "./code";

describe("generateCode", () => {
  it("prefixes and pads to the requested length", () => {
    const code = generateCode("SUB", 4);
    expect(code).toMatch(/^SUB-[0-9A-Z]{4}$/);
  });
  it("produces distinct codes across calls", () => {
    const a = generateCode("SUB", 6);
    const b = generateCode("SUB", 6);
    expect(a).not.toEqual(b);
  });
});
