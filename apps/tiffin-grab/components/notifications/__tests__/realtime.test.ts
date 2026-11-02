import { describe, expect, it, vi } from "vitest";

const close = vi.fn();
const openChannel = vi.fn((_c: string, _cb: (e: { type: string }) => void) => close);
vi.mock("@foundry/realtime/client", () => ({ openChannel: (c: string, cb: (e: { type: string }) => void) => openChannel(c, cb) }));

const { makeSubscriber } = await import("../realtime");

describe("bell subscriber", () => {
  it("opens notify:<user> via openChannel and only reacts to message frames", async () => {
    const onEvent = vi.fn();
    const off = await makeSubscriber("u1")(onEvent);
    expect(openChannel).toHaveBeenCalledWith("notify:u1", expect.any(Function));
    const cb = openChannel.mock.calls[0]![1];
    cb({ type: "presence" });
    expect(onEvent).not.toHaveBeenCalled();
    cb({ type: "message" });
    expect(onEvent).toHaveBeenCalledTimes(1);
    off();
    expect(close).toHaveBeenCalled();
  });
});
