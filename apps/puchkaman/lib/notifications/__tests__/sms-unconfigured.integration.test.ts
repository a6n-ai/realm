import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { drainPending as pkgDrain } from "@realm/notifications";
import { db } from "@/db/client";
import { notificationOutbox, notificationPrefs, users } from "@/db/schema";
import { notificationTables } from "@/lib/notifications/tables";
import { buildAppHandlers } from "@/lib/notifications/handlers";
import { enqueueNotification } from "@/lib/notifications/enqueue";
import { upsertCustomer } from "@/lib/customers/upsert-customer";
import { getSmsProvider } from "@/lib/notifications/sms-provider";
import { getWhatsAppProvider } from "@/lib/notifications/whatsapp-provider";

const MARK = "sms-unconfig";
const ids: bigint[] = [];

afterEach(async () => {
  if (!ids.length) return;
  await db.delete(notificationOutbox).where(inArray(notificationOutbox.recipientId, ids));
  await db.delete(notificationPrefs).where(inArray(notificationPrefs.userId, ids));
  await db.delete(users).where(inArray(users.id, ids));
  ids.length = 0;
});

describe("sms/whatsapp while Twilio is unconfigured", () => {
  it("has no provider without credentials", () => {
    expect(getSmsProvider()).toBeUndefined();
    expect(getWhatsAppProvider()).toBeUndefined();
  });

  it("leaves an sms row pending with a retry rather than losing or sending it", async () => {
    const id = await db.transaction(async (tx) => {
      const uid = await upsertCustomer(tx, { email: `${MARK}@example.test`, phone: "+14165550188" });
      await enqueueNotification(tx, {
        event: "order_placed",
        recipientId: uid,
        title: "t",
        body: "b",
        channels: ["sms"],
        dedupeKey: `${MARK}:sms`,
      });
      return uid;
    });
    ids.push(id);

    await pkgDrain({ db, tables: notificationTables, handlers: buildAppHandlers() });

    const [row] = await db
      .select({
        status: notificationOutbox.status,
        attempts: notificationOutbox.attempts,
        lastError: notificationOutbox.lastError,
        nextAttemptAt: notificationOutbox.nextAttemptAt,
      })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.recipientId, id));

    // The intended state until toll-free verification clears: retried with
    // backoff, never silently dropped and never marked sent.
    expect(row.status).toBe("pending");
    expect(row.attempts).toBe(1);
    expect(row.lastError).toBe("No handler for channel sms");
    expect(row.nextAttemptAt).toBeGreaterThan(Date.now());
  });
});
