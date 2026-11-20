import type { KeyboardEvent } from "react";

/**
 * Enter that should act (submit, apply, create), not Enter that confirms an IME candidate
 * (Japanese, Chinese, Korean). Safari lacks `isComposing` and reports the confirming keydown
 * as keyCode 229, so both checks are needed.
 */
export const isSubmitEnter = (e: KeyboardEvent) =>
  e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229;
