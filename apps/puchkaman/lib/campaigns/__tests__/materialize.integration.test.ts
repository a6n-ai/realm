import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { materializeCampaign } from "@realm/notifications";
import { db } from "@/db/client";
import {
  campaign,
  contactList,
  contactListMember,
  notificationOutbox,
  notificationTables,
} from "@/db/schema";
import { usersRef } from "@/lib/notifications/tables";
import { resolveSegment } from "@/lib/campaigns/segment";

const MARK = "cmp-int";
const listIds: bigint[] = [];
const campaignIds: bigint[] = [];

async function seedList(
  emails: string[],
  consent: { source: "purchase" | "express_optin"; at: number } = {
    source: "express_optin",
    at: Date.now(),
  },
): Promise<string> {
  const [l] = await db
    .insert(contactList)
    .values({ name: MARK, consentSource: consent.source, consentAt: consent.at })
    .returning({ id: contactList.id, publicId: contactList.publicId });
  listIds.push(l.id);
  if (emails.length) {
    await db.insert(contactListMember).values(emails.map((email) => ({ listId: l.id, email })));
  }
  return l.publicId;
}

async function seedCampaign(listPublicId: string): Promise<string> {
  const [c] = await db
    .insert(campaign)
    .values({
      name: MARK,
      channels: ["email"],
      audience: { listIds: [listPublicId] },
      status: "draft",
    })
    .returning({ id: campaign.id, publicId: campaign.publicId });
  campaignIds.push(c.id);
  return c.publicId;
}

const deps = () => ({ db, tables: notificationTables, users: usersRef, resolveSegment });

afterEach(async () => {
  if (campaignIds.length) {
    await db.delete(notificationOutbox).where(inArray(notificationOutbox.campaignId, campaignIds));
    await db.delete(campaign).where(inArray(campaign.id, campaignIds));
    campaignIds.length = 0;
  }
  if (listIds.length) {
    await db.delete(contactListMember).where(inArray(contactListMember.listId, listIds));
    await db.delete(contactList).where(inArray(contactList.id, listIds));
    listIds.length = 0;
  }
  await db
    .delete(notificationTables.messageSuppression)
    .where(like(notificationTables.messageSuppression.address, `${MARK}%`));
});

describe("materializeCampaign", () => {
  it("queues one marketing outbox row per list member", async () => {
    const list = await seedList([`${MARK}-a@example.test`, `${MARK}-b@example.test`]);
    const pub = await seedCampaign(list);
    const { queued } = await materializeCampaign(deps(), pub);
    expect(queued).toBe(2);

    const rows = await db
      .select({ kind: notificationOutbox.kind, channel: notificationOutbox.channel })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.campaignId, campaignIds[0]));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.kind === "marketing" && r.channel === "email")).toBe(true);
  });

  it("is idempotent — re-running queues no duplicates", async () => {
    const list = await seedList([`${MARK}-c@example.test`]);
    const pub = await seedCampaign(list);
    await materializeCampaign(deps(), pub);
    await materializeCampaign(deps(), pub);
    const rows = await db
      .select({ id: notificationOutbox.id })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.campaignId, campaignIds[0]));
    expect(rows).toHaveLength(1);
  });

  it("excludes an unsubscribed member", async () => {
    const list = await seedList([`${MARK}-d@example.test`, `${MARK}-e@example.test`]);
    await db
      .update(contactListMember)
      .set({ unsubscribedAt: Date.now() })
      .where(eq(contactListMember.email, `${MARK}-d@example.test`));
    const pub = await seedCampaign(list);
    const { queued } = await materializeCampaign(deps(), pub);
    expect(queued).toBe(1);
  });

  it("excludes an address suppressed for marketing", async () => {
    const blocked = `${MARK}-f@example.test`;
    await db
      .insert(notificationTables.messageSuppression)
      .values({ address: blocked, channel: "email", scope: "marketing", reason: "unsubscribe" });
    const list = await seedList([blocked, `${MARK}-g@example.test`]);
    const pub = await seedCampaign(list);
    const { queued } = await materializeCampaign(deps(), pub);
    expect(queued).toBe(1);
  });

  it("contributes nobody from a list whose implied consent has lapsed", async () => {
    const list = await seedList([`${MARK}-h@example.test`], {
      source: "purchase",
      at: Date.now() - 800 * 86_400_000, // > 24 months
    });
    const pub = await seedCampaign(list);
    const { queued } = await materializeCampaign(deps(), pub);
    expect(queued).toBe(0);
  });

  it("marks the campaign sent and records the queued count", async () => {
    const list = await seedList([`${MARK}-i@example.test`]);
    const pub = await seedCampaign(list);
    await materializeCampaign(deps(), pub);
    const [row] = await db
      .select({ status: campaign.status, counts: campaign.counts, sentAt: campaign.sentAt })
      .from(campaign)
      .where(eq(campaign.publicId, pub));
    expect(row.status).toBe("sent");
    expect(row.counts).toMatchObject({ queued: 1 });
    expect(row.sentAt).toBeTruthy();
  });
});
