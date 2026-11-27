import { beforeEach, describe, expect, it, vi } from "vitest";

const queued = vi.hoisted(() => vi.fn(async (_row: unknown) => {}));
vi.mock("@/db/client", () => ({ db: { transaction: (fn: (tx: unknown) => unknown) => fn({ insert: () => ({ values: queued }) }) } }));
vi.mock("@/lib/notifications/outbox-signal", () => ({ signalOutbox: vi.fn(async () => {}) }));
vi.mock("@relay/engine", async (orig) => ({ ...(await orig<typeof import("@relay/engine")>()), handleUnsubscribe: vi.fn(async () => {}) }));

import { signUnsubscribeToken } from "@relay/engine";
import { applyUnsubscribe } from "./apply-unsubscribe";

const SECRET = "test-unsubscribe-secret-0123456789abcdef";

function link(address: string, token: string) {
  const u = new URL("https://app.tiffingrab.ca/api/unsubscribe");
  u.searchParams.set("address", address);
  u.searchParams.set("token", token);
  return u;
}

describe("applyUnsubscribe token check", () => {
  beforeEach(() => {
    process.env.UNSUBSCRIBE_SECRET = SECRET;
    queued.mockClear();
  });

  it("queues a valid link, marketing only, with the address lowercased", async () => {
    await applyUnsubscribe(link("Ana@X.ca", signUnsubscribeToken(SECRET, "Ana@X.ca")), "link");
    expect(queued).toHaveBeenCalledWith(expect.objectContaining({ email: "ana@x.ca", reason: "unsubscribe", stream: "marketing" }));
  });

  it("queues nothing for a bad token", async () => {
    expect(await applyUnsubscribe(link("ana@x.ca", "bad"), "link")).toEqual({ applied: false, address: null });
    expect(queued).not.toHaveBeenCalled();
  });
});
