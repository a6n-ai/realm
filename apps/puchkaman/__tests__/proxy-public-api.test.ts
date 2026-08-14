import { describe, expect, it } from "vitest";
import { config, PROTECTED_PREFIXES, PUBLIC_API } from "../proxy";

/** Mirrors the match in proxy(): exact path, or a path segment beneath it. */
const isPublic = (pathname: string) =>
  PUBLIC_API.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * Anonymous checkout depends on these being reachable without a session. When
 * one is missing the symptom is silent — the address dropdown simply never
 * returns anything, with no error shown to the customer — which is how
 * /api/delivery/suggest shipped auth-gated and stayed unnoticed until it was
 * curled against production.
 */
describe("PUBLIC_API", () => {
  it.each(["/api/checkout", "/api/delivery/check-address", "/api/delivery/suggest"])(
    "keeps %s reachable without a session",
    (path) => {
      expect(PUBLIC_API).toContain(path);
    },
  );
});

/**
 * The same failure mode, second occurrence: every one of these is called by a
 * machine or by someone with no account, so none can present a session cookie.
 * Gated, they fail silently in ways that look like the other system is broken —
 * SNS reports a subscription that never confirms, a recipient's unsubscribe
 * link 401s, a carrier's STOP is ignored.
 */
describe("PUBLIC_API — tokenless and machine-to-machine callers", () => {
  it.each([
    ["/api/webhooks/ses", "SNS signature is the auth"],
    ["/api/webhooks/twilio/inbound", "Twilio signature is the auth"],
    ["/api/webhooks/twilio/status", "Twilio signature is the auth"],
    ["/api/unsubscribe", "HMAC token is the auth"],
    ["/api/notifications/drain", "DRAIN_SECRET header is the auth"],
    ["/api/account/phone/start", "rate limited; customers have no login"],
    ["/api/account/phone/verify", "rate limited; customers have no login"],
  ])("keeps %s reachable without a session (%s)", (path) => {
    expect(isPublic(path)).toBe(true);
  });

  it.each([
    "/api/notifications/templates",
    "/api/notifications/campaigns",
    "/api/notifications/contact-lists",
    "/api/notifications",
  ])("still gates %s behind a session", (path) => {
    // The drain entry is exact-match, so allowlisting it must not open the
    // admin routes that sit alongside it under /api/notifications.
    expect(isPublic(path)).toBe(false);
  });
});

/**
 * /me holds a customer's order history and contact details. Without a prefix
 * entry it renders for anyone with the URL, because the matcher — not the
 * handler — is what decides whether proxy() is consulted at all.
 */
describe("PROTECTED_PREFIXES", () => {
  it.each(["/dashboard", "/me"])("requires a session cookie under %s", (prefix) => {
    expect(PROTECTED_PREFIXES).toContain(prefix);
  });
});

/**
 * A prefix missing from config.matcher never reaches proxy() at all — Next
 * skips invoking the middleware for unmatched paths, so the gate fails open
 * with no error anywhere. PROTECTED_PREFIXES alone can't catch that; this
 * ties the two lists together so a prefix added without a matcher entry
 * fails here automatically.
 */
describe("config.matcher", () => {
  it("has a matcher entry for every protected prefix", () => {
    for (const prefix of PROTECTED_PREFIXES) {
      expect(config.matcher).toContain(`${prefix}/:path*`);
    }
  });
});
