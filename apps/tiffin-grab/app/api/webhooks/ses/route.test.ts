import { beforeEach, describe, expect, it, vi } from "vitest";

const { suppress } = vi.hoisted(() => ({ suppress: vi.fn() }));
vi.mock("@/lib/notifications/suppression", () => ({ suppressEmailRecipient: suppress }));

import { processSesEvent } from "./route";

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

  it("ignores delivery/other events", async () => {
    await processSesEvent(msg({ eventType: "Delivery", delivery: {} }));
    expect(suppress).not.toHaveBeenCalled();
  });
});
