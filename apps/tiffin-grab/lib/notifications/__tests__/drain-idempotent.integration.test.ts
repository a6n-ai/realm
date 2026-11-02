import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { drainPending, enqueue } from "@relay/engine";
import { db } from "@/db/client";
import { notificationOutbox, users } from "@/db/schema";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { dueScheduledCampaignIds } from "@/lib/notifications/campaign-schedule";

const MARK = "drain-idem";
const userIds: bigint[] = [];
const campaignIds: string[] = [];

afterEach(async () => {
  if (userIds.length) {
    await db.delete(notificationOutbox).where(inArray(notificationOutbox.recipientId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
    userIds.length = 0;
  }
  for (const id of campaignIds) await db.delete(notificationTables.campaign).where(eq(notificationTables.campaign.publicId, id));
  campaignIds.length = 0;
});

describe("drain under duplicate queue messages", () => {
  it("sends each pending row once when two drains race", async () => {
    for (let i = 0; i < 5; i++) {
      const [u] = await db.insert(users).values({ name: MARK, email: `${MARK}-${i}@example.test`, role: "user", status: "active" }).returning({ id: users.id });
      userIds.push(u.id);
      await db.transaction((tx) =>
        enqueue(tx, notificationTables, usersRef, { event: "order_activated", recipientId: u.id, title: "t", body: "b", channels: ["email"], kind: "transactional" }),
      );
    }
    const sent: string[] = [];
    const handlers = {
      email: async (row: { id: bigint }) => {
        sent.push(String(row.id));
        await new Promise((r) => setTimeout(r, 20));
        return { providerMessageId: `mock-${row.id}` };
      },
    } as never;
    // limit 2 forces several claim rounds per drain, so the two drains interleave.
    await Promise.all([
      drainPending({ db, tables: notificationTables, handlers, maxAttempts: 1 }, 2, 10),
      drainPending({ db, tables: notificationTables, handlers, maxAttempts: 1 }, 2, 10),
    ]);
    expect(sent).toHaveLength(5);
    expect(new Set(sent).size).toBe(5);
    const rows = await db.select({ status: notificationOutbox.status }).from(notificationOutbox).where(inArray(notificationOutbox.recipientId, userIds));
    expect(rows.every((r) => r.status === "sent")).toBe(true);
  });
});

describe("dueScheduledCampaignIds", () => {
  it("reads scheduled campaigns whose time has come from the database", async () => {
    const mk = async (name: string, status: "scheduled" | "draft", scheduledAt: number) => {
      const [c] = await db
        .insert(notificationTables.campaign)
        .values({ name, channels: ["email"], audience: {}, status, scheduledAt })
        .returning({ publicId: notificationTables.campaign.publicId });
      campaignIds.push(String(c.publicId));
      return String(c.publicId);
    };
    const due = await mk(`${MARK}-due`, "scheduled", 1_000);
    const later = await mk(`${MARK}-later`, "scheduled", 9_000);
    const draft = await mk(`${MARK}-draft`, "draft", 1_000);
    const ids = await dueScheduledCampaignIds(5_000);
    expect(ids).toContain(due);
    expect(ids).not.toContain(later);
    expect(ids).not.toContain(draft);
  });
});
