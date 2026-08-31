import { describe, expect, it } from "vitest";
import { buildUnsubscribeUrl, signUnsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe";

const SECRET = "test-secret";

describe("unsubscribe tokens", () => {
  it("verifies a token it signed", () => {
    const t = signUnsubscribeToken(SECRET, "a@x.com");
    expect(verifyUnsubscribeToken(SECRET, "a@x.com", t)).toBe(true);
  });

  it("is case- and whitespace-insensitive on the address", () => {
    const t = signUnsubscribeToken(SECRET, "a@x.com");
    expect(verifyUnsubscribeToken(SECRET, "  A@X.COM ", t)).toBe(true);
  });

  it("rejects a token for a different address", () => {
    const t = signUnsubscribeToken(SECRET, "a@x.com");
    expect(verifyUnsubscribeToken(SECRET, "b@x.com", t)).toBe(false);
  });

  it("rejects a token signed with a different secret", () => {
    const t = signUnsubscribeToken("other", "a@x.com");
    expect(verifyUnsubscribeToken(SECRET, "a@x.com", t)).toBe(false);
  });

  it("rejects malformed tokens without throwing", () => {
    expect(verifyUnsubscribeToken(SECRET, "a@x.com", "")).toBe(false);
    expect(verifyUnsubscribeToken(SECRET, "a@x.com", "zzzz")).toBe(false);
    expect(verifyUnsubscribeToken(SECRET, "a@x.com", "ab")).toBe(false);
  });

  it("builds an absolute link carrying address and token", () => {
    const url = new URL(buildUnsubscribeUrl("https://puchkaman.ca", SECRET, "A@X.com"));
    expect(url.pathname).toBe("/unsubscribe");
    expect(url.searchParams.get("address")).toBe("a@x.com");
    expect(verifyUnsubscribeToken(SECRET, "a@x.com", url.searchParams.get("token")!)).toBe(true);
  });
});
