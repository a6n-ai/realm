import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { inArray, like } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationOutbox, notifications, relayOutbox, users } from "@/db/schema";
import { enqueueNotification, enqueueStaffNotification } from "@/lib/notifications/enqueue";
import { enqueueViaRelay } from "@/lib/relay/enqueue";

const MARK = "relay-int";
const created: bigint[] = [];

async function makeUser(email: string, role: "user" | "admin" = "user"): Promise<bigint> {
  const [u] = await db.insert(users).values({ name: MARK, email, role, status: "active" }).returning({ id: users.id });
  created.push(u!.id);
  return u!.id;
}

beforeEach(() => {
  process.env.EMAIL_VIA_RELAY = "1";
});

afterEach(async () => {
  delete process.env.EMAIL_VIA_RELAY;
  await db.delete(relayOutbox).where(like(relayOutbox.idempotencyKey, `${MARK}%`));
  await db.delete(relayOutbox).where(inArray(relayOutbox.recipientId, created));
  await db.delete(notificationOutbox).where(inArray(notificationOutbox.recipientId, created));
  await db.delete(notifications).where(inArray(notifications.userId, created));
  await db.delete(users).where(inArray(users.id, created));
  created.length = 0;
});

const input = (recipientId: bigint, dedupeKey?: string) => ({
  event: "payment_received" as const,
  recipientId,
  title: "t",
  body: "b",
  channels: ["email" as const],
  dedupeKey,
});

describe("enqueueNotification with EMAIL_VIA_RELAY on", () => {
  it("writes one relay_outbox row keyed dedupe:email, in the same transaction", async () => {
    const email = `${MARK}-a@example.test`;
    const id = await makeUser(email);
    await db.transaction((tx) => enqueueNotification(tx, input(id, `${MARK}-k1`)));
    const rows = await db.select().from(relayOutbox).where(inArray(relayOutbox.recipientId, [id]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ idempotencyKey: `${MARK}-k1:email`, stream: "transactional", recipientEmail: email, status: "pending" });
    const engine = await db.select({ id: notificationOutbox.id }).from(notificationOutbox).where(inArray(notificationOutbox.recipientId, [id]));
    expect(engine).toHaveLength(0);
  });

  it("writes nothing when the business transaction rolls back", async () => {
    const id = await makeUser(`${MARK}-b@example.test`);
    await expect(
      db.transaction(async (tx) => {
        await enqueueNotification(tx, input(id, `${MARK}-k2`));
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(await db.select().from(relayOutbox).where(inArray(relayOutbox.recipientId, [id]))).toHaveLength(0);
  });

  it("keeps one row for a repeated dedupe key", async () => {
    const id = await makeUser(`${MARK}-c@example.test`);
    await db.transaction((tx) => enqueueNotification(tx, input(id, `${MARK}-k3`)));
    await db.transaction((tx) => enqueueNotification(tx, input(id, `${MARK}-k3`)));
    expect(await db.select().from(relayOutbox).where(inArray(relayOutbox.recipientId, [id]))).toHaveLength(1);
  });

  it("writes an in-app feed row, not an outbox row, for an in_app-only input", async () => {
    const id = await makeUser(`${MARK}-d@example.test`);
    await db.transaction((tx) =>
      enqueueViaRelay(tx, [{ recipientId: id, title: "Hello", body: "World", channels: ["in_app"], dedupeKey: `${MARK}-k4` }]),
    );
    const feed = await db.select({ title: notifications.title, body: notifications.body }).from(notifications).where(inArray(notifications.userId, [id]));
    expect(feed).toEqual([{ title: "Hello", body: "World" }]);
    expect(await db.select().from(relayOutbox).where(inArray(relayOutbox.recipientId, [id]))).toHaveLength(0);
  });

  it("fans a staff notification out to one row per staff member with the :u<id> suffix", async () => {
    const staffId = await makeUser(`${MARK}-e@example.test`, "admin");
    await db.transaction((tx) =>
      enqueueStaffNotification(tx, { organizationId: null, event: "payment_received", title: "t", body: "b", channels: ["email"], dedupeKey: `${MARK}-k5` }),
    );
    const mine = await db.select({ key: relayOutbox.idempotencyKey }).from(relayOutbox).where(inArray(relayOutbox.recipientId, [staffId]));
    expect(mine.map((r) => r.key)).toEqual([`${MARK}-k5:u${staffId}:email`]);
  });

  it("writes the engine outbox, not relay_outbox, when the flag is off", async () => {
    delete process.env.EMAIL_VIA_RELAY;
    const id = await makeUser(`${MARK}-f@example.test`);
    await db.transaction((tx) => enqueueNotification(tx, input(id, `${MARK}-k6`)));
    expect(await db.select().from(relayOutbox).where(inArray(relayOutbox.recipientId, [id]))).toHaveLength(0);
    const engine = await db.select({ key: notificationOutbox.dedupeKey }).from(notificationOutbox).where(inArray(notificationOutbox.recipientId, [id]));
    expect(engine.map((r) => r.key)).toEqual([`${MARK}-k6:email`]);
  });
});
