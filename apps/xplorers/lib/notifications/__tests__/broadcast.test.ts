import { describe, expect, it, vi } from "vitest";

const publish = vi.fn();
vi.mock("@/lib/realtime/bus", () => ({ realtimeBus: { publish: (...a: unknown[]) => publish(...a) } }));
vi.mock("@/db/client", () => ({
  db: { select: () => ({ from: () => ({ where: async () => [{ publicId: "u1" }] }) }) },
}));

import { broadcastNotification } from "../broadcast";

describe("broadcastNotification", () => {
  it("publishes a message ping on the user's channel", async () => {
    publish.mockResolvedValue(undefined);
    await broadcastNotification({ userId: 1n });
    expect(publish).toHaveBeenCalledWith("notify:u1", { type: "message", channel: "notify:u1" });
  });

  it("broadcastNotification swallows a publish failure", async () => {
    publish.mockRejectedValue(new Error("worker down"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(broadcastNotification({ userId: 1n })).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});
