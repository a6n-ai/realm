import { beforeEach, describe, expect, it, vi } from "vitest";

const suppress = vi.fn();
vi.mock("@/lib/notifications/suppression", () => ({
  suppressEmailRecipient: (email: string, reason: string) => suppress(email, reason),
}));

const { processSesEvent } = await import("./route");

beforeEach(() => suppress.mockClear());

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
