import { afterEach, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { drainPending, enqueue, suppress } from "@relay/engine";
import { db } from "@/db/client";
import { notificationOutbox, users } from "@/db/schema";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { buildAppHandlers } from "@/lib/notifications/handlers";

const MARK = "outbox-int";
const created: bigint[] = [];

async function makeUser(email: string): Promise<bigint> {
  const [u] = await db
    .insert(users)
    .values({ name: MARK, email, role: "user", status: "active" })
    .returning({ id: users.id });
  created.push(u.id);
  return u.id;
}

afterEach(async () => {
  if (created.length === 0) return;
  await db.delete(notificationOutbox).where(inArray(notificationOutbox.recipientId, created));
  await db.delete(notificationTables.notificationPrefs).where(inArray(notificationTables.notificationPrefs.userId, created));
  await db.delete(notificationTables.notifications).where(inArray(notificationTables.notifications.userId, created));
  await db.delete(users).where(inArray(users.id, created));
  created.length = 0;
});

describe("enqueue + drain", () => {
  it("writes one outbox row per allowed channel", async () => {
    const id = await makeUser(`${MARK}-a@example.test`);
    await db.transaction((tx) =>
      enqueue(tx, notificationTables, usersRef, {
        event: "order_activated",
        recipientId: id,
        title: "t",
        body: "b",
        channels: ["email", "in_app"],
      }),
    );
    const rows = await db
      .select({ channel: notificationOutbox.channel, kind: notificationOutbox.kind })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.recipientId, id));
    expect(rows.map((r) => r.channel).sort()).toEqual(["email", "in_app"]);
    expect(rows.every((r) => r.kind === "transactional")).toBe(true);
  });

  it("skips a channel suppressed for the recipient's address", async () => {
    const email = `${MARK}-b@example.test`;
    const id = await makeUser(email);
    await suppress(db, notificationTables, { address: email, channel: "email", reason: "bounce" });
    await db.transaction((tx) =>
      enqueue(tx, notificationTables, usersRef, {
        event: "order_activated",
        recipientId: id,
        title: "t",
        body: "b",
        channels: ["email", "in_app"],
      }),
    );
    const rows = await db
      .select({ channel: notificationOutbox.channel })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.recipientId, id));
    expect(rows.map((r) => r.channel)).toEqual(["in_app"]);
    await db
      .delete(notificationTables.messageSuppression)
      .where(eq(notificationTables.messageSuppression.address, email));
  });

  it("does not let a marketing opt-out block a transactional send", async () => {
    const id = await makeUser(`${MARK}-c@example.test`);
    await db.insert(notificationTables.notificationPrefs).values({
      userId: id,
      channel: "email",
      kind: "marketing",
      enabled: false,
    });
    await db.transaction((tx) =>
      enqueue(tx, notificationTables, usersRef, {
        event: "order_activated",
        recipientId: id,
        title: "t",
        body: "b",
        channels: ["email"],
        kind: "transactional",
      }),
    );
    const rows = await db
      .select({ channel: notificationOutbox.channel })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.recipientId, id));
    expect(rows).toHaveLength(1);
  });

  it("terminates a row with no template instead of retrying it", async () => {
    const id = await makeUser(`${MARK}-d@example.test`);
    await db.transaction((tx) =>
      enqueue(tx, notificationTables, usersRef, {
        event: "manual_adjustment",
        recipientId: id,
        title: "t",
        body: "b",
        channels: ["in_app"],
      }),
    );
    await drainPending({ db, tables: notificationTables, handlers: buildAppHandlers() });
    const [row] = await db
      .select({
        status: notificationOutbox.status,
        attempts: notificationOutbox.attempts,
        lastError: notificationOutbox.lastError,
      })
      .from(notificationOutbox)
      .where(and(eq(notificationOutbox.recipientId, id), eq(notificationOutbox.channel, "in_app")));
    expect(row.status).toBe("sent");
    expect(row.attempts).toBe(1);
    expect(row.lastError).toBe("skipped: no template");
  });
});
