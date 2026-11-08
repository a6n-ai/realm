import { describe, expect, it } from "vitest";
import { areaSlug, parseWindow, sharedPrefixes } from "./areas";

const z = (name: string, postalPrefixes: string[], active = true) => ({ name, active, postalPrefixes, slotWindow: null });

describe("areaSlug", () => {
  it("makes URL-safe anchors", () => {
    expect(areaSlug("Richmond Hill")).toBe("richmond-hill");
    expect(areaSlug("Queen's Park")).toBe("queens-park");
  });
});

describe("parseWindow", () => {
  it("reads the stored slot text", () => {
    expect(parseWindow("11:00 AM – 2:00 PM")).toEqual({ from: "11 AM", to: "2 PM", fromHour: 11, toHour: 14 });
    expect(parseWindow("9:00 AM – 12:30 PM")).toEqual({ from: "9 AM", to: "12:30 PM", fromHour: 9, toHour: 12.5 });
  });
  it("is null for text it can't read", () => {
    expect(parseWindow(null)).toBeNull();
    expect(parseWindow("mornings")).toBeNull();
  });
});

describe("sharedPrefixes", () => {
  it("finds exact and nested overlaps", () => {
    const thornhill = z("Thornhill", ["L3T", "L4J"]);
    const vaughan = z("Vaughan", ["L4H", "L4J"]);
    const toronto = z("Toronto", ["M4"]);
    const eastYork = z("East York", ["M4B"]);
    const all = [thornhill, vaughan, toronto, eastYork];
    expect([...sharedPrefixes(vaughan, all)].map(([p, o]) => [p, o.map((x) => x.name)])).toEqual([["L4J", ["Thornhill"]]]);
    expect([...sharedPrefixes(eastYork, all)].map(([p, o]) => [p, o.map((x) => x.name)])).toEqual([["M4B", ["Toronto"]]]);
  });
});
