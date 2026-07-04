import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/notifications/broadcast", () => ({ broadcast: vi.fn() }));
import { broadcast } from "../lib/notifications/broadcast";
import { handleMessage } from "./notify-consumer";

const msg = Buffer.from(JSON.stringify({
  userId: "1", publicId: "ntf_abc", event: "order.confirmed",
  title: "Confirmed", body: "ok", href: "/orders/1",
}));

describe("handleMessage", () => {
  it("calls broadcast with a bigint userId", async () => {
    vi.mocked(broadcast).mockResolvedValue(undefined);
    await handleMessage(msg);
    expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({ userId: 1n, publicId: "ntf_abc" }));
  });

  it("propagates a broadcast failure so the caller can nack → DLQ", async () => {
    vi.mocked(broadcast).mockRejectedValue(new Error("appsync down"));
    await expect(handleMessage(msg)).rejects.toThrow("appsync down");
  });
});
