import { describe, expect, it } from "vitest";
import { SIDEBAR_WIDTH_COOKIE, parseSidebarWidth } from "../sidebar-width";

describe("parseSidebarWidth", () => {
  it("returns the default when the cookie is missing or empty", () => {
    expect(parseSidebarWidth(undefined)).toBe(255);
    expect(parseSidebarWidth(null)).toBe(255);
    expect(parseSidebarWidth("")).toBe(255);
  });

  it("returns the default for junk instead of clamping it", () => {
    expect(parseSidebarWidth("junk")).toBe(255);
    expect(parseSidebarWidth("NaN")).toBe(255);
  });

  it("reads a saved width", () => {
    expect(parseSidebarWidth("280")).toBe(280);
  });

  it("clamps out-of-range widths to 200 to 320", () => {
    expect(parseSidebarWidth("999")).toBe(320);
    expect(parseSidebarWidth("-5")).toBe(200);
    expect(parseSidebarWidth("100")).toBe(200);
  });

  it("uses the tg_sidebar_width cookie", () => {
    expect(SIDEBAR_WIDTH_COOKIE).toBe("tg_sidebar_width");
  });
});
