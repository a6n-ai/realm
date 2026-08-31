import { describe, expect, it } from "vitest";
import { IMPLIED_CONSENT_MS, dedupeRecipients, isConsentValid } from "./audience";

const DAY = 86_400_000;

describe("isConsentValid", () => {
  it("treats express consent as not expiring", () => {
    expect(isConsentValid("express_optin", 0, 100 * 365 * DAY)).toBe(true);
  });

  it("accepts implied consent inside 24 months", () => {
    const now = 1_000 * DAY;
    expect(isConsentValid("purchase", now - IMPLIED_CONSENT_MS + DAY, now)).toBe(true);
  });

  it("rejects implied consent past 24 months", () => {
    const now = 1_000 * DAY;
    expect(isConsentValid("purchase", now - IMPLIED_CONSENT_MS - DAY, now)).toBe(false);
  });

  it("uses a 24-month window", () => {
    expect(IMPLIED_CONSENT_MS).toBe(730 * DAY);
  });
});

describe("dedupeRecipients", () => {
  it("collapses the same email arriving from a segment and a list", () => {
    const out = dedupeRecipients([
      { userId: 1n, email: "a@x.com" },
      { email: "A@X.com", vars: { city: "Toronto" } },
    ]);
    expect(out).toHaveLength(1);
  });

  it("prefers the entry that carries a user id", () => {
    const out = dedupeRecipients([{ email: "a@x.com" }, { userId: 7n, email: "a@x.com" }]);
    expect(out[0].userId).toBe(7n);
  });

  it("merges merge-vars from the list entry onto the kept recipient", () => {
    const out = dedupeRecipients([
      { userId: 7n, email: "a@x.com" },
      { email: "a@x.com", vars: { city: "Toronto" } },
    ]);
    expect(out[0]).toMatchObject({ userId: 7n, vars: { city: "Toronto" } });
  });

  it("keeps distinct addresses apart", () => {
    expect(dedupeRecipients([{ email: "a@x.com" }, { email: "b@x.com" }])).toHaveLength(2);
  });

  it("drops an entry with neither an email nor a phone", () => {
    expect(dedupeRecipients([{ userId: 1n }])).toHaveLength(0);
  });
});
