import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const publish = vi.fn();
vi.mock("@/lib/realtime/bus", () => ({ realtimeBus: { publish: (...a: unknown[]) => publish(...a) } }));
vi.mock("@/db/client", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ publicId: "u1" }] }) }) }) },
}));

const { broadcast } = await import("../broadcast");
const input = { userId: 1n, publicId: "n1", event: null, title: "t", body: "b", href: null };

describe("broadcast", () => {
  beforeEach(() => {
    publish.mockReset();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("publishes notify:<user> through the realtime Worker when configured", async () => {
    vi.stubEnv("REALTIME_URL", "https://rt.example");
    vi.stubEnv("REALTIME_SECRET", "s".repeat(32));
    await broadcast(input);
    expect(publish).toHaveBeenCalledWith("notify:u1", { type: "message", channel: "notify:u1" });
  });

  it("does nothing without a realtime Worker", async () => {
    vi.stubEnv("REALTIME_URL", "");
    await broadcast(input);
    expect(publish).not.toHaveBeenCalled();
  });
});
