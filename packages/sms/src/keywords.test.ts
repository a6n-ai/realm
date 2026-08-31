import { describe, expect, it } from "vitest";
import { isStartKeyword, isStopKeyword } from "./keywords";

describe("isStopKeyword", () => {
  it.each(["STOP", "stop", " Stop ", "ARRÊT", "ARRET", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"])(
    "recognises %s",
    (word) => expect(isStopKeyword(word)).toBe(true),
  );

  it("does not fire on a stop word inside a sentence", () => {
    expect(isStopKeyword("please stop by at 6")).toBe(false);
  });

  it("does not fire on empty input", () => {
    expect(isStopKeyword("")).toBe(false);
  });
});

describe("isStartKeyword", () => {
  it.each(["START", "unstop", "YES"])("recognises %s", (w) => expect(isStartKeyword(w)).toBe(true));

  it("does not confuse START with STOP", () => {
    expect(isStartKeyword("STOP")).toBe(false);
    expect(isStopKeyword("START")).toBe(false);
  });
});
