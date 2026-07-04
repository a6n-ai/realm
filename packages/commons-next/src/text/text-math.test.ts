import { describe, expect, it, vi } from "vitest";

vi.mock("@chenglou/pretext", () => {
  const CHAR_WIDTH = 8; // fixed width per char for deterministic tests

  function wrap(text: string, maxWidth: number) {
    const maxChars = Math.max(1, Math.floor(maxWidth / CHAR_WIDTH));
    const words = text.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > maxChars && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  return {
    prepare: (text: string) => ({ text }),
    prepareWithSegments: (text: string) => ({ text }),
    layout: (prepared: { text: string }, maxWidth: number, lineHeight = 20) => {
      const lines = wrap(prepared.text, maxWidth);
      return { height: lines.length * lineHeight, lineCount: lines.length };
    },
    layoutWithLines: (prepared: { text: string }, maxWidth: number, lineHeight = 20) => {
      const lines = wrap(prepared.text, maxWidth);
      return {
        height: lines.length * lineHeight,
        lineCount: lines.length,
        lines: lines.map((text) => ({ text, width: text.length * CHAR_WIDTH, start: 0, end: text.length })),
      };
    },
  };
});

const { clampToLines, fitFontSize } = await import("./text-math");

describe("clampToLines", () => {
  it("returns all lines untruncated when text fits within maxLines", () => {
    const result = clampToLines("short text", "16px Arial", 200, 20, 3);
    expect(result.truncated).toBe(false);
    expect(result.lines.length).toBeLessThanOrEqual(3);
  });

  it("truncates to maxLines and adds ellipsis to the last line", () => {
    const longText = "one two three four five six seven eight nine ten eleven twelve";
    const result = clampToLines(longText, "16px Arial", 80, 20, 2);
    expect(result.truncated).toBe(true);
    expect(result.lines).toHaveLength(2);
    expect(result.lines[1].endsWith("…")).toBe(true);
  });
});

describe("fitFontSize", () => {
  it("keeps base font size when text already fits", () => {
    const result = fitFontSize("hi", "16px Arial", 500, 500, 20);
    expect(result.fontSizePx).toBe(16);
  });

  it("shrinks font size when text overflows maxHeight", () => {
    const longText = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen";
    const result = fitFontSize(longText, "40px Arial", 100, 60, 48);
    expect(result.fontSizePx).toBeLessThan(40);
    expect(result.fontSizePx).toBeGreaterThanOrEqual(8);
  });

  it("throws when baseFont has no px size", () => {
    expect(() => fitFontSize("hi", "Arial", 100, 100, 20)).toThrow();
  });
});
