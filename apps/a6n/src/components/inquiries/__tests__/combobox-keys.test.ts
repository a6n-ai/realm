import { describe, expect, test } from "vitest";
import { comboKey } from "../combobox-keys";

describe("comboKey", () => {
  test("ArrowDown from none selects first, wraps at the end", () => {
    expect(comboKey("ArrowDown", -1, 3, false)).toEqual({ active: 0, open: true, select: false });
    expect(comboKey("ArrowDown", 2, 3, true)?.active).toBe(0);
  });
  test("ArrowUp from none wraps to last", () => {
    expect(comboKey("ArrowUp", -1, 3, true)?.active).toBe(2);
  });
  test("Enter selects the active option and closes", () => {
    expect(comboKey("Enter", 1, 3, true)).toEqual({ active: 1, open: false, select: true });
  });
  test("Enter with no active option or closed list is left alone", () => {
    expect(comboKey("Enter", -1, 3, true)).toBeNull();
    expect(comboKey("Enter", 1, 3, false)).toBeNull();
  });
  test("Escape closes; arrows with no options do nothing", () => {
    expect(comboKey("Escape", 1, 3, true)?.open).toBe(false);
    expect(comboKey("ArrowDown", -1, 0, false)).toBeNull();
  });
});
