import { afterEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({ env: { OUTBOX: { send } }, ctx: { waitUntil: () => {} } }),
}));

const forwardRelayOutbox = vi.fn(async () => ({ sent: 0, failed: 0, retryAfterMs: null }));
vi.mock("@/lib/relay/forward", () => ({ forwardRelayOutbox }));
const background: Promise<unknown>[] = [];
vi.mock("@foundry/cloud/background", () => ({ runInBackground: (task: () => Promise<unknown>) => void background.push(task()) }));

const { signalOutbox } = await import("../outbox-signal");

describe("signalOutbox", () => {
  afterEach(() => {
    send.mockReset();
    forwardRelayOutbox.mockClear();
    background.length = 0;
    delete process.env.EMAIL_VIA_RELAY;
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

  it("forwards relay_outbox at once under EMAIL_VIA_RELAY, and still rings the queue", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    process.env.EMAIL_VIA_RELAY = "1";
    await signalOutbox();
    await Promise.all(background);
    expect(forwardRelayOutbox).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not forward with the flag off", async () => {
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    await signalOutbox();
    expect(forwardRelayOutbox).not.toHaveBeenCalled();
  });

  it("does not touch the queue on Node", async () => {
    await signalOutbox();
    expect(send).not.toHaveBeenCalled();
  });
});
