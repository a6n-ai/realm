import { afterEach, describe, expect, it, vi } from "vitest";

const sample = {
  userId: 1n,
  publicId: "ntf_abc",
  event: "order.confirmed",
  title: "Confirmed",
  body: "Your order is confirmed",
  href: "/orders/1",
};

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("publishPush", () => {
  it("returns false and does not connect when RABBITMQ_URL is unset", async () => {
    vi.stubEnv("RABBITMQ_URL", "");
    const { publishPush } = await import("./rabbit");
    await expect(publishPush(sample)).resolves.toBe(false);
  });

  it("declares topology with DLX and a durable queue", async () => {
    const assertExchange = vi.fn().mockResolvedValue({});
    const assertQueue = vi.fn().mockResolvedValue({});
    const bindQueue = vi.fn().mockResolvedValue({});
    const { assertNotifyTopology, NOTIFY_QUEUE, NOTIFY_DLX } = await import("./rabbit");
    await assertNotifyTopology({ assertExchange, assertQueue, bindQueue } as never);

    expect(assertQueue).toHaveBeenCalledWith(
      NOTIFY_QUEUE,
      expect.objectContaining({ durable: true, arguments: { "x-dead-letter-exchange": NOTIFY_DLX } }),
    );
  });
});
