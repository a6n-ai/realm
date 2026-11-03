import { describe, expect, it } from "vitest";
import { CONSENT_VERSION, parseConsent } from "../consent";

const enc = (v: unknown) => encodeURIComponent(JSON.stringify(v));

describe("parseConsent", () => {
  it("reads a current record", () => {
    expect(parseConsent(enc({ v: CONSENT_VERSION, analytics: true, at: 1 }))?.analytics).toBe(true);
    expect(parseConsent(enc({ v: CONSENT_VERSION, analytics: false, at: 1 }))?.analytics).toBe(false);
  });
  it("treats missing, malformed and outdated records as no consent", () => {
    expect(parseConsent(undefined)).toBeNull();
    expect(parseConsent("not-json")).toBeNull();
    expect(parseConsent(enc({ v: CONSENT_VERSION - 1, analytics: true, at: 1 }))).toBeNull();
    expect(parseConsent(enc({ v: CONSENT_VERSION, analytics: "yes", at: 1 }))).toBeNull();
  });
});
