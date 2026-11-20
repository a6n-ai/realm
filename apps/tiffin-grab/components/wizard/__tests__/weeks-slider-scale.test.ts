import { describe, expect, it } from "vitest";
import { toScale } from "../weeks-slider";

describe("toScale", () => {
  it("keeps sizes already on the type scale, in rem", () => {
    expect(toScale(12)).toBe("0.75rem");
    expect(toScale(20)).toBe("1.25rem");
  });

  it("snaps an off-scale size to the nearest step (the smaller one on a tie)", () => {
    expect(toScale(19)).toBe("1.125rem");
    expect(toScale(21)).toBe("1.25rem");
    expect(toScale(30)).toBe("1.375rem");
  });
});
