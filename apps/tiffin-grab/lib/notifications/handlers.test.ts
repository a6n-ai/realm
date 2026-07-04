import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./rabbit", () => ({ publishPush: vi.fn() }));
vi.mock("./broadcast", () => ({ broadcast: vi.fn() }));

import { publishPush } from "./rabbit";
import { broadcast } from "./broadcast";
import { __inAppForTest } from "./handlers";

// Seeded system user (id + locale "en") and "order_created" (has a seeded
// in_app template) — the handler returns early with no seeded in_app
// template for the event, so this must match apps/tiffin-grab/db/seed-notification-templates.tsx.
const row = {
  recipientId: 391960512490898445n,
  event: "order_created",
  channel: "in_app",
  payload: { href: "/orders/1", vars: { order: { code: "ORD-1", customerName: "Test" } } },
} as never;

beforeEach(() => vi.clearAllMocks());

describe("inApp push routing", () => {
  it("publishes to RabbitMQ and does NOT call broadcast when publish confirms", async () => {
    vi.mocked(publishPush).mockResolvedValue(true);
    await __inAppForTest(row);
    expect(publishPush).toHaveBeenCalledOnce();
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("falls back to inline broadcast when publish returns false", async () => {
    vi.mocked(publishPush).mockResolvedValue(false);
    await __inAppForTest(row);
    expect(publishPush).toHaveBeenCalledOnce();
    expect(broadcast).toHaveBeenCalledOnce();
  });
});
