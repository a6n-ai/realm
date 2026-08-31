import { describe, expect, it } from "vitest";
import { MAX_ATTEMPTS, nextBackoffMs, resolveChannels } from "./policy";

describe("nextBackoffMs", () => {
  it("doubles from one minute and caps at one hour", () => {
    expect(nextBackoffMs(0)).toBe(60_000);
    expect(nextBackoffMs(1)).toBe(120_000);
    expect(nextBackoffMs(2)).toBe(240_000);
    expect(nextBackoffMs(99)).toBe(3_600_000);
  });

  it("has a max-attempts ceiling", () => {
    expect(MAX_ATTEMPTS).toBe(6);
  });
});

describe("resolveChannels", () => {
  it("defaults a channel on when no pref row exists", () => {
    expect(resolveChannels(["in_app"], [], {})).toEqual(["in_app"]);
  });

  it("drops a channel the user disabled for this kind", () => {
    const prefs = [{ channel: "email" as const, kind: "marketing" as const, enabled: false }];
    expect(resolveChannels(["email"], prefs, { kind: "marketing" })).toEqual([]);
  });

  it("keeps transactional email when only marketing email is disabled", () => {
    const prefs = [{ channel: "email" as const, kind: "marketing" as const, enabled: false }];
    expect(resolveChannels(["email"], prefs, { kind: "transactional" })).toEqual(["email"]);
  });

  it("drops a suppressed channel regardless of kind", () => {
    expect(
      resolveChannels(["email", "in_app"], [], { kind: "transactional", suppressed: ["email"] }),
    ).toEqual(["in_app"]);
  });

  it("honours the legacy notifyEmail opt-out when there is no pref row", () => {
    expect(resolveChannels(["email", "in_app"], [], { notifyEmail: false })).toEqual(["in_app"]);
  });
});
