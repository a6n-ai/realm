import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inArray, like } from "drizzle-orm";

const signalOutbox = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/notifications/outbox-signal", () => ({ signalOutbox }));
vi.mock("@/lib/notifications/drain", () => ({ materializeDue: async () => 0, drainPending: async () => 0 }));

const { db } = await import("@/db/client");
const { messageSuppression, relayBlockQueue } = await import("@/db/schema");
const { blockParity, pushBlocks } = await import("./blocks");
const { setRelayClientForTests } = await import("./client");
const { runCronJob } = await import("@/lib/cron/run");
const { runNotificationsCron } = await import("@/lib/cron/notifications");

import type { RelayBlockImportRow, RelayClient, RelaySuppressionStatus } from "./client";

const importSuppressions = vi.fn(async (rows: RelayBlockImportRow[]) => ({ accepted: rows.length, rejected: [] as number[] }));
const suppressionStatus = vi.fn(async (_emails: string[], _from?: string) => [] as RelaySuppressionStatus[]);

const event = (i: number) => ({ email: `push-${i}@example.test`, reason: "bounce", stream: null, source: "ses", createdAt: 1000 + i });
const queue = (n: number) => db.insert(relayBlockQueue).values(Array.from({ length: n }, (_, i) => event(i)));
const queued = () => db.select().from(relayBlockQueue);
const clearLocal = () => db.delete(messageSuppression).where(like(messageSuppression.address, "parity-%"));

beforeEach(async () => {
  vi.clearAllMocks();
  setRelayClientForTests({ importSuppressions, suppressionStatus } as unknown as RelayClient);
  await db.delete(relayBlockQueue);
  await clearLocal();
});

afterEach(async () => {
  setRelayClientForTests(null);
  vi.unstubAllEnvs();
  await db.delete(relayBlockQueue);
  await clearLocal();
});

describe("pushBlocks", () => {
  it("pushes in batches and empties the queue", async () => {
    await queue(501);
    expect(await pushBlocks()).toEqual({ pushed: 501, pending: false });
    expect(importSuppressions.mock.calls.map(([rows]) => rows.length)).toEqual([500, 1]);
    expect(importSuppressions.mock.calls[0]![0][0]).toEqual({ ...event(0), campaignRef: null, campaignName: null });
    expect(await queued()).toEqual([]);
  });

  it("keeps rows when Relay is down", async () => {
    await queue(2);
    importSuppressions.mockRejectedValueOnce(new Error("down"));
    expect(await pushBlocks()).toEqual({ pushed: 0, pending: true });
    expect(await queued()).toHaveLength(2);
  });

  it("keeps rows when the reply does not account for every one", async () => {
    await queue(2);
    importSuppressions.mockResolvedValueOnce({ accepted: 1, rejected: [] });
    expect(await pushBlocks()).toEqual({ pushed: 0, pending: true });
    expect(await queued()).toHaveLength(2);
  });

  it("drops a rejected row so it cannot stall the queue", async () => {
    await queue(2);
    importSuppressions.mockResolvedValueOnce({ accepted: 1, rejected: [0] });
    expect(await pushBlocks()).toEqual({ pushed: 1, pending: false });
    expect(await queued()).toEqual([]);
  });

  it.each([[[0, 0]], [[0, 2]], [[-1, 0]]])("keeps rows when the rejected indexes are %j", async (rejected) => {
    await queue(2);
    importSuppressions.mockResolvedValueOnce({ accepted: 0, rejected });
    expect(await pushBlocks()).toEqual({ pushed: 0, pending: true });
    expect(await queued()).toHaveLength(2);
  });

  it("reports pending when the batch budget runs out", async () => {
    await queue(501);
    expect(await pushBlocks(1)).toEqual({ pushed: 500, pending: true });
    expect(await queued()).toHaveLength(1);
  });

  it("runs from the notifications job's Run now", async () => {
    vi.stubEnv("EMAIL_VIA_RELAY", "1");
    await queue(1);
    expect(await runCronJob("notifications", "manual")).toMatchObject({ ok: true, summary: { blocksPushed: 1 } });
    expect(await queued()).toEqual([]);
    expect(signalOutbox).not.toHaveBeenCalled();
  });
});

describe("blockParity", () => {
  const add = async (address: string, reason: string, scope: "all" | "marketing") => {
    const [row] = await db
      .insert(messageSuppression)
      .values({ address, channel: "email", reason, scope })
      .returning({ id: messageSuppression.id });
    return String(row!.id);
  };
  const status = (email: string, reason: RelaySuppressionStatus["reason"], stream: string | null): RelaySuppressionStatus => ({ email, reason, stream, brandOptOut: false });

  it("reports a narrower stream as missing", async () => {
    const id = await add("parity-narrow@example.test", "SES hard bounce", "all");
    suppressionStatus.mockResolvedValue([status("parity-narrow@example.test", "bounce", "marketing")]);
    expect((await blockParity()).missing).toContain(id);
  });

  it("ignores a brand opt-out row", async () => {
    const id = await add("parity-brand@example.test", "unsubscribe", "marketing");
    suppressionStatus.mockResolvedValue([{ ...status("parity-brand@example.test", "unsubscribe", "marketing"), brandOptOut: true }]);
    expect((await blockParity()).missing).toContain(id);
  });

  it("accepts the same reason on every stream or the same stream, wherever the row sits in the reply", async () => {
    const all = await add("parity-all@example.test", "SES complaint", "all");
    const mkt = await add("parity-mkt@example.test", "unsubscribe", "marketing");
    const wide = await add("parity-wide@example.test", "manual", "marketing");
    const wrong = await add("parity-wrong@example.test", "SES complaint", "all");
    suppressionStatus.mockResolvedValue([
      status("parity-all@example.test", "bounce", null),
      status("parity-mkt@example.test", "unsubscribe", "marketing"),
      status("parity-wide@example.test", "manual", null),
      status("parity-wrong@example.test", "bounce", null),
      status("parity-all@example.test", "complaint", null),
    ]);
    const { checked, missing } = await blockParity();
    expect(checked).toBeGreaterThanOrEqual(4);
    for (const id of [all, mkt, wide]) expect(missing).not.toContain(id);
    expect(missing).toContain(wrong);
    expect(suppressionStatus.mock.calls[0]![1]).toContain("@");
  });

  it("lists an address Relay would refuse as missing without sending it", async () => {
    const bad = await add("parity-not-an-email", "SES hard bounce", "all");
    expect((await blockParity()).missing).toContain(bad);
    expect(suppressionStatus.mock.calls.flatMap(([emails]) => emails)).not.toContain("parity-not-an-email");
  });

  it("asks in slices of 100", async () => {
    await db.insert(messageSuppression).values(
      Array.from({ length: 101 }, (_, i) => ({ address: `parity-${i}@example.test`, channel: "email" as const, reason: "manual", scope: "marketing" as const })),
    );
    await blockParity();
    expect(suppressionStatus.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...suppressionStatus.mock.calls.map(([emails]) => emails.length))).toBe(100);
  });

  it("is served by the block-parity cron mode", async () => {
    const res = await runNotificationsCron(new Request("http://x/api/cron/notifications?mode=block-parity"));
    expect(await res.json()).toMatchObject({ checked: expect.any(Number), missing: expect.any(Array) });
  });
});
