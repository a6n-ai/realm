import { describe, it, expect } from "vitest";
import {
  signUnsubscribeToken,
  verifyUnsubscribeToken,
  buildUnsubscribeUrl,
  handleReviewUnsubscribe,
} from "../unsubscribe";
import type { ReviewNudgeState, ReviewNudgeStore } from "../nudge";

function nudgeStore(): ReviewNudgeStore {
  const state = new Map<string, ReviewNudgeState>();
  return {
    get: async (email) => state.get(email),
    markSent: async (email) => {
      state.set(email, { sentAt: new Date(), doneAt: state.get(email)?.doneAt ?? null });
    },
    markDone: async (email) => {
      const existing = state.get(email);
      state.set(email, { sentAt: existing?.sentAt ?? null, doneAt: existing?.doneAt ?? new Date() });
    },
  };
}

describe("unsubscribe token", () => {
  it("round-trips: a token this module signs verifies as valid", () => {
    const token = signUnsubscribeToken("secret", "Customer@Example.com");
    expect(verifyUnsubscribeToken("secret", "customer@example.com", token)).toBe(true);
  });

  it("rejects a token signed with a different secret", () => {
    const token = signUnsubscribeToken("secret-a", "customer@example.com");
    expect(verifyUnsubscribeToken("secret-b", "customer@example.com", token)).toBe(false);
  });

  it("rejects a token for a different email", () => {
    const token = signUnsubscribeToken("secret", "customer@example.com");
    expect(verifyUnsubscribeToken("secret", "someone-else@example.com", token)).toBe(false);
  });

  it("rejects a garbage (non-hex) token instead of throwing", () => {
    expect(verifyUnsubscribeToken("secret", "customer@example.com", "not-hex")).toBe(false);
  });

  it("builds an absolute link carrying email + token", () => {
    const url = buildUnsubscribeUrl("https://tiffin.example", "secret", "customer@example.com");
    expect(url).toContain("https://tiffin.example/api/review-nudge/unsubscribe?");
    expect(url).toContain("email=customer%40example.com");
  });
});

describe("handleReviewUnsubscribe", () => {
  it("marks the customer done on a valid token", async () => {
    const store = nudgeStore();
    const token = signUnsubscribeToken("secret", "customer@example.com");
    await handleReviewUnsubscribe({
      email: "customer@example.com",
      token,
      secret: "secret",
      nudgeStore: store,
    });
    expect(await store.get("customer@example.com")).toMatchObject({ doneAt: expect.any(Date) });
  });

  it("is a no-op on an invalid token — never throws, never writes", async () => {
    const store = nudgeStore();
    await handleReviewUnsubscribe({
      email: "customer@example.com",
      token: "bogus",
      secret: "secret",
      nudgeStore: store,
    });
    expect(await store.get("customer@example.com")).toBeUndefined();
  });

  it("is idempotent — a second unsubscribe keeps the first doneAt", async () => {
    const store = nudgeStore();
    const token = signUnsubscribeToken("secret", "customer@example.com");
    await handleReviewUnsubscribe({ email: "customer@example.com", token, secret: "secret", nudgeStore: store });
    const first = await store.get("customer@example.com");
    await handleReviewUnsubscribe({ email: "customer@example.com", token, secret: "secret", nudgeStore: store });
    const second = await store.get("customer@example.com");
    expect(second?.doneAt).toEqual(first?.doneAt);
  });
});
