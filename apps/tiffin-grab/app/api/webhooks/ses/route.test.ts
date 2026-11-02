import { beforeEach, describe, expect, it, vi } from "vitest";

const { suppress, recordEvent } = vi.hoisted(() => ({ suppress: vi.fn(), recordEvent: vi.fn() }));
vi.mock("@/lib/notifications/suppression", () => ({ suppressEmailRecipient: suppress }));
vi.mock("@relay/engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@relay/engine")>()),
  recordCampaignEvent: (deps: unknown, id: string, type: string) => recordEvent(id, type),
}));

vi.mock("@/lib/notifications/sns-verify", () => ({ verifySnsMessage: async () => true }));

import { POST, processSesEvent } from "./route";

const msg = (o: unknown) => JSON.stringify(o);

beforeEach(() => vi.clearAllMocks());

describe("processSesEvent", () => {
  it("suppresses each recipient of a permanent (hard) bounce", async () => {
    await processSesEvent(
      msg({ eventType: "Bounce", bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: "a@b.com" }, { emailAddress: "c@d.com" }] } }),
    );
    expect(suppress).toHaveBeenCalledTimes(2);
    expect(suppress).toHaveBeenCalledWith("a@b.com", "SES hard bounce");
    expect(suppress).toHaveBeenCalledWith("c@d.com", "SES hard bounce");
  });

  it("does NOT suppress a transient (soft) bounce", async () => {
    await processSesEvent(
      msg({ eventType: "Bounce", bounce: { bounceType: "Transient", bouncedRecipients: [{ emailAddress: "a@b.com" }] } }),
    );
    expect(suppress).not.toHaveBeenCalled();
  });

  it("suppresses complaint recipients", async () => {
    await processSesEvent(
      msg({ eventType: "Complaint", complaint: { complainedRecipients: [{ emailAddress: "spam@x.com" }] } }),
    );
    expect(suppress).toHaveBeenCalledExactlyOnceWith("spam@x.com", "SES complaint");
  });

  it("handles the identity-style notificationType field too", async () => {
    await processSesEvent(
      msg({ notificationType: "Complaint", complaint: { complainedRecipients: [{ emailAddress: "z@z.com" }] } }),
    );
    expect(suppress).toHaveBeenCalledExactlyOnceWith("z@z.com", "SES complaint");
  });

  it("ignores delivery/other events with no message id", async () => {
    await processSesEvent(msg({ eventType: "Delivery", delivery: {} }));
    expect(suppress).not.toHaveBeenCalled();
    expect(recordEvent).not.toHaveBeenCalled();
  });

  it("records a delivered campaign stat when a message id is present", async () => {
    await processSesEvent(msg({ eventType: "Delivery", mail: { messageId: "pid-1" }, delivery: {} }));
    expect(recordEvent).toHaveBeenCalledExactlyOnceWith("pid-1", "delivered");
  });

  it("records an opened campaign stat", async () => {
    await processSesEvent(msg({ eventType: "Open", mail: { messageId: "pid-2" }, open: {} }));
    expect(recordEvent).toHaveBeenCalledExactlyOnceWith("pid-2", "opened");
  });
});

describe("POST topic check", () => {
  const post = () =>
    POST(new Request("https://x.test/api/webhooks/ses", { method: "POST", body: JSON.stringify({ Type: "Notification", TopicArn: "arn:t", Message: "{}" }) }));

  it("refuses everything when SES_FEEDBACK_TOPIC_ARN is unset", async () => {
    vi.stubEnv("SES_FEEDBACK_TOPIC_ARN", "");
    expect((await post()).status).toBe(403);
  });

  it("refuses a different topic and accepts the configured one", async () => {
    vi.stubEnv("SES_FEEDBACK_TOPIC_ARN", "arn:other");
    expect((await post()).status).toBe(403);
    vi.stubEnv("SES_FEEDBACK_TOPIC_ARN", "arn:t");
    expect((await post()).status).toBe(200);
    vi.unstubAllEnvs();
  });
});
