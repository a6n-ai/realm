import { beforeEach, describe, expect, it, vi } from "vitest";

const suppress = vi.fn();
const unsuppress = vi.fn();
vi.mock("@/lib/notifications/suppression", () => ({
  suppressPhone: (p: string, r: string) => suppress(p, r),
  unsuppressPhone: (p: string) => unsuppress(p),
}));

const { processInbound } = await import("./route");

beforeEach(() => {
  suppress.mockClear();
  unsuppress.mockClear();
});

describe("processInbound", () => {
  it("suppresses on STOP", async () => {
    await processInbound({ From: "+14165550134", Body: "STOP" });
    expect(suppress).toHaveBeenCalledWith("+14165550134", "sms STOP keyword");
  });

  it("suppresses on the French ARRÊT", async () => {
    await processInbound({ From: "+14165550134", Body: "ARRÊT" });
    expect(suppress).toHaveBeenCalled();
  });

  it("normalizes the number before suppressing", async () => {
    await processInbound({ From: "4165550134", Body: "stop" });
    expect(suppress).toHaveBeenCalledWith("+14165550134", "sms STOP keyword");
  });

  it("re-enables on START", async () => {
    await processInbound({ From: "+14165550134", Body: "START" });
    expect(unsuppress).toHaveBeenCalledWith("+14165550134");
  });

  it("ignores an ordinary reply", async () => {
    await processInbound({ From: "+14165550134", Body: "is my order ready?" });
    expect(suppress).not.toHaveBeenCalled();
    expect(unsuppress).not.toHaveBeenCalled();
  });

  it("ignores a message with no usable From", async () => {
    await processInbound({ From: "garbage", Body: "STOP" });
    expect(suppress).not.toHaveBeenCalled();
  });
});
