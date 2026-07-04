import { describe, expect, it } from "vitest";
import { MAX_ATTEMPTS, nextBackoffMs, resolveChannels, type PrefRow } from "./policy";

describe("nextBackoffMs", () => {
  it("grows exponentially from 1m", () => {
    expect(nextBackoffMs(0)).toBe(60_000);
    expect(nextBackoffMs(1)).toBe(120_000);
    expect(nextBackoffMs(2)).toBe(240_000);
  });
  it("caps at 1h", () => {
    expect(nextBackoffMs(MAX_ATTEMPTS)).toBe(3_600_000);
    expect(nextBackoffMs(99)).toBe(3_600_000);
  });
});

describe("resolveChannels", () => {
  const wanted = ["email", "in_app"] as const;

  it("defaults non-email channels on when no pref row", () => {
    expect(resolveChannels([...wanted], [], { notifyEmail: true })).toEqual(["email", "in_app"]);
  });

  it("defers email to notifyEmail when no pref row", () => {
    expect(resolveChannels([...wanted], [], { notifyEmail: false })).toEqual(["in_app"]);
  });

  it("an explicit pref row overrides the notifyEmail fallback", () => {
    const prefs: PrefRow[] = [{ channel: "email", enabled: true, suppressed: false }];
    expect(resolveChannels([...wanted], prefs, { notifyEmail: false })).toEqual(["email", "in_app"]);
  });

  it("suppressed channel is dropped even if enabled", () => {
    const prefs: PrefRow[] = [{ channel: "email", enabled: true, suppressed: true }];
    expect(resolveChannels([...wanted], prefs, { notifyEmail: true })).toEqual(["in_app"]);
  });

  it("disabled channel is dropped", () => {
    const prefs: PrefRow[] = [{ channel: "in_app", enabled: false, suppressed: false }];
    expect(resolveChannels([...wanted], prefs, { notifyEmail: true })).toEqual(["email"]);
  });
});
