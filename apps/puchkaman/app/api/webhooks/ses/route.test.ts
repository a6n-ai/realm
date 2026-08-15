import { beforeEach, describe, expect, it, vi } from "vitest";

const suppress = vi.fn();
vi.mock("@/lib/notifications/suppression", () => ({
  suppressEmailRecipient: (email: string, reason: string) => suppress(email, reason),
}));

const recordEvent = vi.fn();
vi.mock("@/lib/notifications/campaign-stats", () => ({
  recordCampaignEvent: (id: string, type: string) => recordEvent(id, type),
}));

const { processSesEvent } = await import("./route");

beforeEach(() => {
  suppress.mockClear();
  recordEvent.mockClear();
});

describe("processSesEvent", () => {
  it("suppresses every recipient of a permanent bounce", async () => {
    await processSesEvent(
      JSON.stringify({
        eventType: "Bounce",
        bounce: {
          bounceType: "Permanent",
          bouncedRecipients: [{ emailAddress: "a@x.com" }, { emailAddress: "b@x.com" }],
        },
      }),
    );
    expect(suppress).toHaveBeenCalledTimes(2);
    expect(suppress).toHaveBeenCalledWith("a@x.com", "SES hard bounce");
  });

  it("ignores a transient bounce", async () => {
    await processSesEvent(
      JSON.stringify({
        eventType: "Bounce",
        bounce: { bounceType: "Transient", bouncedRecipients: [{ emailAddress: "a@x.com" }] },
      }),
    );
    expect(suppress).not.toHaveBeenCalled();
  });

  it("suppresses a complaint", async () => {
    await processSesEvent(
      JSON.stringify({
        eventType: "Complaint",
        complaint: { complainedRecipients: [{ emailAddress: "c@x.com" }] },
      }),
    );
    expect(suppress).toHaveBeenCalledWith("c@x.com", "SES complaint");
  });

  it("ignores a delivery event", async () => {
    await processSesEvent(JSON.stringify({ eventType: "Delivery" }));
    expect(suppress).not.toHaveBeenCalled();
  });

  it("tolerates the legacy notificationType field", async () => {
    await processSesEvent(
      JSON.stringify({
        notificationType: "Complaint",
        complaint: { complainedRecipients: [{ emailAddress: "d@x.com" }] },
      }),
    );
    expect(suppress).toHaveBeenCalledWith("d@x.com", "SES complaint");
  });
});

describe("campaign stat attribution", () => {
  it("counts a delivery against the campaign that sent it", async () => {
    await processSesEvent(JSON.stringify({ eventType: "Delivery", mail: { messageId: "ses-msg-1" } }));
    expect(recordEvent).toHaveBeenCalledWith("ses-msg-1", "delivered");
  });

  it("counts an open and a click", async () => {
    await processSesEvent(JSON.stringify({ eventType: "Open", mail: { messageId: "m2" } }));
    await processSesEvent(JSON.stringify({ eventType: "Click", mail: { messageId: "m3" } }));
    expect(recordEvent).toHaveBeenCalledWith("m2", "opened");
    expect(recordEvent).toHaveBeenCalledWith("m3", "clicked");
  });

  it("counts a bounce as well as suppressing it", async () => {
    await processSesEvent(
      JSON.stringify({
        eventType: "Bounce",
        mail: { messageId: "m4" },
        bounce: { bounceType: "Permanent", bouncedRecipients: [{ emailAddress: "a@x.com" }] },
      }),
    );
    expect(suppress).toHaveBeenCalled();
    expect(recordEvent).toHaveBeenCalledWith("m4", "bounced");
  });

  it("does not attribute an event with no message id", async () => {
    await processSesEvent(JSON.stringify({ eventType: "Delivery" }));
    expect(recordEvent).not.toHaveBeenCalled();
  });
});
