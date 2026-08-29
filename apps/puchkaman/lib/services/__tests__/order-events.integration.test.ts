import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationOutbox, notificationPrefs, users } from "@/db/schema";
import { upsertCustomer } from "@/lib/customers/upsert-customer";
import { enqueueNotification, enqueueStaff } from "@/lib/notifications/enqueue";

const MARK = "order-events";
const userIds: bigint[] = [];

afterEach(async () => {
  if (userIds.length) {
    await db.delete(notificationOutbox).where(inArray(notificationOutbox.recipientId, userIds));
    await db.delete(notificationPrefs).where(inArray(notificationPrefs.userId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
    userIds.length = 0;
  }
});

describe("order event emission", () => {
  it("queues a customer email for order_placed", async () => {
    const id = await db.transaction(async (tx) => {
      const uid = await upsertCustomer(tx, { email: `${MARK}-a@example.test`, name: "Ada" });
      await enqueueNotification(tx, {
        event: "order_placed",
        recipientId: uid,
        title: "Order received",
        body: "We got your order.",
        data: { order: { publicId: "ord_test", total: "12.34" } },
        dedupeKey: "ord_test:order_placed",
      });
      return uid;
    });
    userIds.push(id);

    const rows = await db
      .select({
        channel: notificationOutbox.channel,
        event: notificationOutbox.event,
        kind: notificationOutbox.kind,
      })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.recipientId, id));
    expect(rows).toEqual([{ channel: "email", event: "order_placed", kind: "transactional" }]);
  });

  it("is idempotent on the dedupe key", async () => {
    const id = await db.transaction((tx) => upsertCustomer(tx, { email: `${MARK}-b@example.test` }));
    userIds.push(id);
    for (let i = 0; i < 2; i++) {
      await db.transaction((tx) =>
        enqueueNotification(tx, {
          event: "order_paid",
          recipientId: id,
          title: "Paid",
          body: "Thanks.",
          dedupeKey: "ord_dup:order_paid",
        }),
      );
    }
    const rows = await db
      .select({ id: notificationOutbox.id })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.recipientId, id));
    expect(rows).toHaveLength(1);
  });

  it("writes nothing when the surrounding transaction rolls back", async () => {
    const email = `${MARK}-c@example.test`;
    await expect(
      db.transaction(async (tx) => {
        const uid = await upsertCustomer(tx, { email });
        await enqueueNotification(tx, {
          event: "order_placed",
          recipientId: uid,
          title: "t",
          body: "b",
        });
        throw new Error("simulated failure after enqueue");
      }),
    ).rejects.toThrow("simulated failure");

    const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    expect(rows).toHaveLength(0);
  });

  it("fans a staff event out to every active admin and member", async () => {
    const a = await db
      .insert(users)
      .values({ email: `${MARK}-staff1@example.test`, name: MARK, role: "admin", status: "active" })
      .returning({ id: users.id });
    const b = await db
      .insert(users)
      .values({ email: `${MARK}-staff2@example.test`, name: MARK, role: "member", status: "active" })
      .returning({ id: users.id });
    userIds.push(a[0].id, b[0].id);

    await db.transaction((tx) =>
      enqueueStaff(tx, {
        event: "order_placed",
        title: "New order",
        body: "ord_test",
        dedupeKey: "ord_test:staff",
      }),
    );

    const rows = await db
      .select({ recipientId: notificationOutbox.recipientId, channel: notificationOutbox.channel })
      .from(notificationOutbox)
      .where(inArray(notificationOutbox.recipientId, [a[0].id, b[0].id]));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.channel === "in_app")).toBe(true);
  });
});
