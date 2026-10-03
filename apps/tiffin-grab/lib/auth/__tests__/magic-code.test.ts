import { beforeAll, describe, expect, it } from "vitest";
import { openCode, sealCode } from "../magic-code";

beforeAll(() => {
  process.env.BETTER_AUTH_SECRET ??= "test-secret";
});

describe("magic-link code token", () => {
  it("round-trips without exposing the code", () => {
    const token = sealCode("443075");
    expect(token).not.toContain("443075");
    expect(openCode(token)).toBe("443075");
  });

  it("expires after 10 minutes", () => {
    const now = Date.now();
    expect(openCode(sealCode("443075", now), now + 10 * 60 * 1000 + 1)).toBeNull();
  });

  it("rejects a tampered token", () => {
    const token = sealCode("443075");
    const flipped = token.slice(0, -2) + (token.at(-2) === "A" ? "B" : "A") + token.at(-1);
    expect(openCode(flipped)).toBeNull();
    expect(openCode("junk")).toBeNull();
  });
});
