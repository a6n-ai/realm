import { describe, it, expect, vi } from "vitest";
import type { IntegrationsConfigStore } from "@foundry/commons/plugin";
import type { EmailProvider } from "@foundry/email";
import { dispatchReviewNudge } from "../dispatch";
import { GOOGLE_REVIEWS_PLUGIN_ID } from "../plugin";
import type { ReviewNudgeState, ReviewNudgeStore } from "../nudge";

function configStore(): IntegrationsConfigStore {
  const cfg = {
    [GOOGLE_REVIEWS_PLUGIN_ID]: { installed: true, placeId: "ChIJabc", provider: "places" },
  };
  return { get: async () => cfg, set: async () => {} };
}

function nudgeStore(): ReviewNudgeStore {
  const state = new Map<string, ReviewNudgeState>();
  return {
    get: async (email) => state.get(email),
    markSent: async (email) => {
      state.set(email, { sentAt: new Date(), doneAt: state.get(email)?.doneAt ?? null });
    },
    markDone: async (email) => {
      state.set(email, { sentAt: state.get(email)?.sentAt ?? null, doneAt: new Date() });
    },
  };
}

describe("dispatchReviewNudge", () => {
  it("marks sent before sending, and swallows a send failure", async () => {
    const store = nudgeStore();
    const send = vi.fn().mockRejectedValue(new Error("SES is down"));
    const emailProvider: EmailProvider = { name: "mock", send };

    await expect(
      dispatchReviewNudge({
        email: "customer@example.com",
        businessName: "Puchkaman",
        configStore: configStore(),
        nudgeStore: store,
        emailProvider,
        unsubscribeSecret: "test-secret",
        baseUrl: "https://example.com",
      }),
    ).resolves.toBeUndefined();

    expect(send).toHaveBeenCalledTimes(1);
    expect(await store.get("customer@example.com")).toMatchObject({ sentAt: expect.any(Date) });
    const sent = send.mock.calls[0]![0];
    expect(sent.html).toContain("/api/review-nudge/unsubscribe");
  });

  it("never sends a second time for the same customer, even after a prior send failed", async () => {
    const store = nudgeStore();
    const send = vi.fn().mockRejectedValue(new Error("SES is down"));
    const emailProvider: EmailProvider = { name: "mock", send };
    const input = {
      email: "customer@example.com",
      businessName: "Puchkaman",
      configStore: configStore(),
      nudgeStore: store,
      emailProvider,
      unsubscribeSecret: "test-secret",
      baseUrl: "https://example.com",
    };

    await dispatchReviewNudge(input);
    await dispatchReviewNudge(input);

    expect(send).toHaveBeenCalledTimes(1);
  });
});
