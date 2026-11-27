import { beforeEach, describe, expect, it, vi } from "vitest";
import { asc, inArray } from "drizzle-orm";

const signalOutbox = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/lib/notifications/outbox-signal", () => ({ signalOutbox }));
vi.mock("@/lib/actions/staff-action", () => ({
  staffAction: async (_opts: unknown, fn: () => Promise<unknown>) => {
    await fn();
    return { ok: true };
  },
}));

const { db } = await import("@/db/client");
const { messageSuppression, relayBlockQueue } = await import("@/db/schema");
const { suppressEmailRecipient } = await import("@/lib/notifications/suppression");
const { suppressManuallyAction } = await import("@/app/(dashboard)/dashboard/notifications/unsubscribed/actions");

const SES = "blockq-ses@example.test";
const MANUAL = "blockq-manual@example.test";

const local = (address: string) => db.select().from(messageSuppression).where(inArray(messageSuppression.address, [address]));
const queued = () => db.select().from(relayBlockQueue).orderBy(asc(relayBlockQueue.id));

beforeEach(async () => {
  signalOutbox.mockClear();
  await db.delete(relayBlockQueue);
  await db.delete(messageSuppression).where(inArray(messageSuppression.address, [SES, MANUAL]));
});

describe("block queue", () => {
  it("keeps the local complaint when a bounce follows, and queues both events", async () => {
    await suppressEmailRecipient(" BlockQ-SES@example.test ", "SES complaint");
    await suppressEmailRecipient(SES, "SES hard bounce");

    expect(await local(SES)).toMatchObject([{ reason: "SES complaint", scope: "all" }]);
    expect(await queued()).toMatchObject([
      { email: SES, reason: "complaint", stream: null, source: "ses" },
      { email: SES, reason: "bounce", stream: null, source: "ses" },
    ]);
    expect(signalOutbox).toHaveBeenCalledTimes(2);
  });

  it("lets a complaint replace a bounce", async () => {
    await suppressEmailRecipient(SES, "SES hard bounce");
    await suppressEmailRecipient(SES, "SES complaint");
    expect(await local(SES)).toMatchObject([{ reason: "SES complaint" }]);
  });

  it("queues a manual add", async () => {
    await suppressManuallyAction("BlockQ-Manual@example.test", "email");
    expect(await local(MANUAL)).toHaveLength(1);
    expect(await queued()).toMatchObject([{ email: MANUAL, reason: "manual", stream: "marketing", source: "admin" }]);
    expect(signalOutbox).toHaveBeenCalledTimes(1);
  });

  it("queues nothing for an invalid address or a phone number", async () => {
    await expect(suppressManuallyAction("not-an-email", "email")).rejects.toThrow("valid email");
    await suppressManuallyAction("+14165550199", "sms");
    expect(await queued()).toEqual([]);
    await db.delete(messageSuppression).where(inArray(messageSuppression.address, ["+14165550199"]));
  });
});
