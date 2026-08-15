import { beforeEach, describe, expect, it, vi } from "vitest";

const recordEvent = vi.fn();
const suppress = vi.fn();
vi.mock("@/lib/notifications/campaign-stats", () => ({
  recordCampaignEvent: (id: string, t: string) => recordEvent(id, t),
}));
vi.mock("@/lib/notifications/suppression", () => ({
  suppressPhone: (p: string, r: string) => suppress(p, r),
}));

const { processStatus } = await import("./route");

beforeEach(() => {
  recordEvent.mockClear();
  suppress.mockClear();
});

describe("processStatus", () => {
  it("counts a delivered message", async () => {
    await processStatus({ MessageSid: "SM1", MessageStatus: "delivered" });
    expect(recordEvent).toHaveBeenCalledWith("SM1", "delivered");
  });

  it("counts a failed message", async () => {
    await processStatus({ MessageSid: "SM2", MessageStatus: "failed" });
    expect(recordEvent).toHaveBeenCalledWith("SM2", "failed");
  });

  it("suppresses a number on an unreachable-carrier error", async () => {
    await processStatus({
      MessageSid: "SM3",
      MessageStatus: "undelivered",
      ErrorCode: "30006",
      To: "whatsapp:+14165550134",
    });
    expect(suppress).toHaveBeenCalledWith("+14165550134", "carrier undeliverable 30006");
  });

  it("does NOT suppress on a transient error", async () => {
    await processStatus({
      MessageSid: "SM4",
      MessageStatus: "undelivered",
      ErrorCode: "30001",
      To: "+14165550134",
    });
    expect(suppress).not.toHaveBeenCalled();
  });

  it("ignores an intermediate queued status", async () => {
    await processStatus({ MessageSid: "SM5", MessageStatus: "queued" });
    expect(recordEvent).not.toHaveBeenCalled();
  });

  it("counts a WhatsApp read receipt", async () => {
    await processStatus({ MessageSid: "SM6", MessageStatus: "read" });
    expect(recordEvent).toHaveBeenCalledWith("SM6", "read");
  });

  it("ignores a status with no message sid", async () => {
    await processStatus({ MessageStatus: "delivered" });
    expect(recordEvent).not.toHaveBeenCalled();
  });
});
