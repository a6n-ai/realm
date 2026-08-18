import { beforeEach, describe, expect, it, vi } from "vitest";

const purgeCarts = vi.fn();
const remindAbandonedCarts = vi.fn();
const remindAbandonedOrders = vi.fn();
const syncPendingPaymentStatuses = vi.fn();
const terminalizeAbandonedOrders = vi.fn();

vi.mock("@/lib/recovery/passes", () => ({
  purgeCarts: (...args: unknown[]) => purgeCarts(...args),
  remindAbandonedCarts: (...args: unknown[]) => remindAbandonedCarts(...args),
  remindAbandonedOrders: (...args: unknown[]) => remindAbandonedOrders(...args),
  syncPendingPaymentStatuses: (...args: unknown[]) => syncPendingPaymentStatuses(...args),
  terminalizeAbandonedOrders: (...args: unknown[]) => terminalizeAbandonedOrders(...args),
}));

const { GET } = await import("./route");

beforeEach(() => {
  purgeCarts.mockClear();
  remindAbandonedCarts.mockClear();
  remindAbandonedOrders.mockClear();
  syncPendingPaymentStatuses.mockClear();
  terminalizeAbandonedOrders.mockClear();
  delete process.env.CRON_SECRET;
});

describe("GET /api/cron/abandoned-recovery", () => {
  it("fails closed with no Authorization header", async () => {
    process.env.CRON_SECRET = "shh";
    const res = await GET(new Request("https://x.test/api/cron/abandoned-recovery"));
    expect(res.status).toBe(401);
    expect(remindAbandonedOrders).not.toHaveBeenCalled();
  });

  it("fails closed with a wrong bearer token", async () => {
    process.env.CRON_SECRET = "shh";
    const res = await GET(
      new Request("https://x.test/api/cron/abandoned-recovery", {
        headers: { Authorization: "Bearer wrong" },
      }),
    );
    expect(res.status).toBe(401);
    expect(remindAbandonedOrders).not.toHaveBeenCalled();
  });

  it("fails closed when no secret is configured at all, even with a bearer header", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(
      new Request("https://x.test/api/cron/abandoned-recovery", {
        headers: { Authorization: "Bearer anything" },
      }),
    );
    expect(res.status).toBe(401);
    expect(remindAbandonedOrders).not.toHaveBeenCalled();
  });

  it("runs all five passes and returns their counts when authorized", async () => {
    process.env.CRON_SECRET = "shh";
    remindAbandonedOrders.mockResolvedValue(1);
    remindAbandonedCarts.mockResolvedValue(2);
    syncPendingPaymentStatuses.mockResolvedValue(5);
    terminalizeAbandonedOrders.mockResolvedValue(3);
    purgeCarts.mockResolvedValue(4);

    const res = await GET(
      new Request("https://x.test/api/cron/abandoned-recovery", {
        headers: { Authorization: "Bearer shh" },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      remindedOrders: 1,
      remindedCarts: 2,
      paymentsSynced: 5,
      terminalized: 3,
      purged: 4,
      failures: [],
    });
  });

  it("isolates one pass's failure from the rest — they still run, and the failure is reported", async () => {
    process.env.CRON_SECRET = "shh";
    remindAbandonedOrders.mockRejectedValue(new Error("RECOVERY_LINK_SECRET is not set"));
    remindAbandonedCarts.mockResolvedValue(2);
    syncPendingPaymentStatuses.mockResolvedValue(5);
    terminalizeAbandonedOrders.mockResolvedValue(3);
    purgeCarts.mockResolvedValue(4);

    const res = await GET(
      new Request("https://x.test/api/cron/abandoned-recovery", {
        headers: { Authorization: "Bearer shh" },
      }),
    );
    expect(res.status).toBe(200);
    expect(remindAbandonedCarts).toHaveBeenCalled();
    expect(syncPendingPaymentStatuses).toHaveBeenCalled();
    expect(terminalizeAbandonedOrders).toHaveBeenCalled();
    expect(purgeCarts).toHaveBeenCalled();
    expect(await res.json()).toEqual({
      remindedOrders: null,
      remindedCarts: 2,
      paymentsSynced: 5,
      terminalized: 3,
      purged: 4,
      failures: ["remindedOrders"],
    });
  });
});
