import { afterEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: { OUTBOX: { send } }, ctx: { waitUntil: () => {} } }),
}));

const { signalOutbox } = await import("../outbox-signal");

describe("signalOutbox", () => {
  afterEach(() => {
    send.mockReset();
    vi.unstubAllGlobals();
  });

  it("sends to the queue on Workers", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    await signalOutbox();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ at: expect.any(Number) });
  });

  it("never throws when the queue send fails", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    send.mockRejectedValue(new Error("queue down"));
    await expect(signalOutbox()).resolves.toBeUndefined();
  });

  it("does not touch the queue on Node", async () => {
    await signalOutbox();
    expect(send).not.toHaveBeenCalled();
  });
});
