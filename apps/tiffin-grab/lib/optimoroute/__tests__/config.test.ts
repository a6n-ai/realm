import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPTIMOROUTE_CONFIG,
  looksUpstairs,
  optimoRouteApiKey,
  parseOptimoRouteConfig,
  stopDuration,
} from "../config";

const D = DEFAULT_OPTIMOROUTE_CONFIG.duration;

describe("stopDuration", () => {
  // These four numbers are operational knowledge carried over from the Route Maker sheet:
  // downtown parking and stairs genuinely cost time, and a route planned without them
  // runs late by mid-afternoon.
  it("charges more for a slow city, stairs, and both together", () => {
    expect(stopDuration(D, { city: "Mississauga", upstairs: false })).toBe(1);
    expect(stopDuration(D, { city: "Toronto", upstairs: false })).toBe(2);
    expect(stopDuration(D, { city: "Mississauga", upstairs: true })).toBe(5);
    expect(stopDuration(D, { city: "Toronto", upstairs: true })).toBe(7);
  });

  it("matches the city case-insensitively and tolerates padding", () => {
    expect(stopDuration(D, { city: "  toronto ", upstairs: false })).toBe(2);
    expect(stopDuration(D, { city: "TORONTO", upstairs: true })).toBe(7);
  });

  it("falls back to base for a missing city", () => {
    expect(stopDuration(D, { city: null, upstairs: false })).toBe(1);
  });
});

describe("looksUpstairs", () => {
  it("reads the free-text signal the spreadsheet uses", () => {
    expect(looksUpstairs("Upstairs Delivery")).toBe(true);
    expect(looksUpstairs("please ring, upstairs")).toBe(true);
    expect(looksUpstairs("leave at front door")).toBe(false);
    expect(looksUpstairs(null)).toBe(false);
  });
});

describe("parseOptimoRouteConfig", () => {
  it("fills defaults for an absent or malformed blob", () => {
    expect(parseOptimoRouteConfig(undefined).duration.slowCityUpstairs).toBe(7);
    expect(parseOptimoRouteConfig({ installed: "yes" }).installed).toBe(false);
  });

  it("keeps operator overrides", () => {
    const cfg = parseOptimoRouteConfig({
      installed: true,
      duration: { base: 3, slowCities: ["ottawa"], slowCity: 4, upstairs: 6, slowCityUpstairs: 9 },
    });
    expect(cfg.installed).toBe(true);
    expect(stopDuration(cfg.duration, { city: "Ottawa", upstairs: true })).toBe(9);
    expect(stopDuration(cfg.duration, { city: "Toronto", upstairs: false })).toBe(3);
  });
});

describe("optimoRouteApiKey", () => {
  it("is null when unset or blank, so callers fail loudly rather than send key=''", () => {
    expect(optimoRouteApiKey({} as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(optimoRouteApiKey({ OPTIMOROUTE_API_KEY: "   " } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(optimoRouteApiKey({ OPTIMOROUTE_API_KEY: " k " } as unknown as NodeJS.ProcessEnv)).toBe("k");
  });
});
