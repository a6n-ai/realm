import { describe, expect, it } from "vitest";
import type { KeyboardEvent } from "react";
import { isSubmitEnter } from "../enter-key";

const key = (key: string, { isComposing = false, keyCode = key === "Enter" ? 13 : 0 } = {}) =>
  ({ key, keyCode, nativeEvent: { isComposing } }) as unknown as KeyboardEvent;

describe("isSubmitEnter", () => {
  it("acts on a plain Enter", () => expect(isSubmitEnter(key("Enter"))).toBe(true));
  it("ignores other keys", () => expect(isSubmitEnter(key("a"))).toBe(false));
  it("ignores Enter while an IME is composing", () => expect(isSubmitEnter(key("Enter", { isComposing: true }))).toBe(false));
  it("ignores Safari's confirming keydown (keyCode 229)", () => expect(isSubmitEnter(key("Enter", { keyCode: 229 }))).toBe(false));
});
