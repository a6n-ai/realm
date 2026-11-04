import { afterEach, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationOutbox } from "@/db/schema";
import { notificationTables } from "@/lib/notifications/tables";
import { computeNotifyNextAt, earliestPendingAt } from "../notify-next";

const MARK = "zz-notify-next";
const campaign = notificationTables.campaign;

const outboxAt = (nextAttemptAt: number, status: "pending" | "sent" = "pending") =>
  db.insert(notificationOutbox).values({ channel: "email", payload: {}, recipientEmail: `${MARK}@example.test`, status, nextAttemptAt });
const campaignAt = (n: string, status: "scheduled" | "draft", scheduledAt: number) =>
  db.insert(campaign).values({ name: `${MARK}-${n}`, channels: ["email"], audience: {}, status, scheduledAt });

afterEach(async () => {
  await db.delete(notificationOutbox).where(eq(notificationOutbox.recipientEmail, `${MARK}@example.test`));
  await db.delete(campaign).where(like(campaign.name, `${MARK}%`));
});

describe("computeNotifyNextAt", () => {
  it("is the earliest scheduled campaign, ignoring drafts and outbox rows", async () => {
    await campaignAt("a", "scheduled", 4);
    await campaignAt("b", "scheduled", 3);
    await campaignAt("c", "draft", 2);
    await outboxAt(1);
    expect(await computeNotifyNextAt()).toBe(3);
  });
});

describe("earliestPendingAt", () => {
  it("is the earliest pending outbox time, ignoring sent rows", async () => {
    await outboxAt(9);
    await outboxAt(5);
    await outboxAt(1, "sent");
    expect(await earliestPendingAt()).toBe(5);
  });
});
