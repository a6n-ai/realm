import { describe, expect, it, vi } from "vitest";

const close = vi.fn();
const openChannel = vi.fn((_c: string, _cb: (e: { type: string }) => void, _opts?: unknown) => close);
vi.mock("@foundry/realtime/client", () => ({
  openChannel: (c: string, cb: (e: { type: string }) => void, opts?: unknown) => openChannel(c, cb, opts),
}));

const { makeSubscriber, subscribeChannel } = await import("../realtime");

describe("bell subscriber", () => {
  it("opens notify:<user> via openChannel and only reacts to message frames", async () => {
    const onEvent = vi.fn();
    const off = await makeSubscriber("u1")(onEvent);
    expect(openChannel).toHaveBeenCalledWith("notify:u1", expect.any(Function), undefined);
    const cb = openChannel.mock.calls[0]![1];
    cb({ type: "presence" });
    expect(onEvent).not.toHaveBeenCalled();
    cb({ type: "message" });
    expect(onEvent).toHaveBeenCalledTimes(1);
    off();
    expect(close).toHaveBeenCalled();
  });

  it("shares one openChannel across subscribers on the same channel", () => {
    openChannel.mockClear();
    close.mockClear();
    const a = vi.fn();
    const b = vi.fn();
    const offA = subscribeChannel("notify:u1", a);
    const offB = subscribeChannel("notify:u1", b);
    expect(openChannel).toHaveBeenCalledTimes(1);
    const cb = openChannel.mock.calls[0]![1];
    cb({ type: "message" });
    expect(a).toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
    offA();
    expect(close).not.toHaveBeenCalled();
    offB();
    expect(close).toHaveBeenCalled();
  });
});
