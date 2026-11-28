import { describe, expect, test } from "vitest";
import { relativeTime } from "../relative-time";

const NOW = 1_000_000_000_000;
describe("relativeTime", () => {
  test.each([
    [30_000, "just now"],
    [5 * 60_000, "5m ago"],
    [3 * 3_600_000, "3h ago"],
    [2 * 86_400_000, "2d ago"],
    [14 * 86_400_000, "2w ago"],
    [60 * 86_400_000, ""],
  ])("%i ms ago reads %s", (diff, text) => expect(relativeTime(NOW - diff, NOW)).toBe(text));
});
