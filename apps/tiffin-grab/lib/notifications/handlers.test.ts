import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./rabbit", () => ({ publishPush: vi.fn() }));
vi.mock("./broadcast", () => ({ broadcast: vi.fn() }));

import { publishPush } from "./rabbit";
import { broadcast } from "./broadcast";
import { appBroadcast } from "./handlers";

// The delivery mechanics now live in @relay/engine and are tested there.
// What stays app-local — and is the only part that can regress here — is the
// publish-after-commit routing: Rabbit first, inline broadcast as the fallback.
const input = {
  userId: 1n,
  publicId: "ntf_test",
  event: "order_created",
  title: "t",
  body: "b",
  href: "/orders/1",
};

beforeEach(() => vi.clearAllMocks());

describe("appBroadcast push routing", () => {
  it("publishes to RabbitMQ and does NOT call broadcast when publish confirms", async () => {
    vi.mocked(publishPush).mockResolvedValue(true);
    await appBroadcast(input);
    expect(publishPush).toHaveBeenCalledOnce();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("falls back to inline broadcast when publish returns false", async () => {
    vi.mocked(publishPush).mockResolvedValue(false);
    await appBroadcast(input);
    expect(publishPush).toHaveBeenCalledOnce();
    expect(broadcast).toHaveBeenCalledOnce();
  });
});
