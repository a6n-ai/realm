import { and, count, desc, isNotNull, isNull, notInArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { campaign, contactList, customerGroups } from "@/db/schema";
import { pageOrder } from "@foundry/database";
import { epochBoundsWhere } from "@/lib/list/default-month";

// Group-backed lists are rewritten from the group on every sync, so edits here would be lost.
const notGroupBacked = notInArray(
  contactList.publicId,
  db.select({ id: customerGroups.contactListPublicId }).from(customerGroups).where(isNotNull(customerGroups.contactListPublicId)),
);

const CONTACT_LIST_SORT = {
  name: contactList.name,
  memberCount: contactList.memberCount,
  createdAt: contactList.createdAt,
} as const;
export type ContactListSortColumn = keyof typeof CONTACT_LIST_SORT;
export const CONTACT_LIST_SORT_COLUMNS = Object.keys(CONTACT_LIST_SORT) as ContactListSortColumn[];

export async function contactListStats(dates: { from?: string; to?: string }) {
  const where = and(notGroupBacked, epochBoundsWhere(contactList.createdAt, dates));
  const [[{ n: lists }], [{ total: contacts }]] = await Promise.all([
    db.select({ n: count() }).from(contactList).where(where),
    db.select({ total: sql<number>`cast(coalesce(sum(${contactList.memberCount}), 0) as int)` }).from(contactList).where(where),
  ]);
  return { lists, contacts };
}

export async function listContactLists(opts: { filter: SQL | undefined; sort: { column: ContactListSortColumn; dir: "asc" | "desc" }; size: number; offset: number }) {
  const where = and(notGroupBacked, opts.filter);
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        publicId: contactList.publicId,
        name: contactList.name,
        consentSource: contactList.consentSource,
        consentAt: contactList.consentAt,
        consentNote: contactList.consentNote,
        memberCount: contactList.memberCount,
        segmentDef: contactList.segmentDef,
        createdAt: contactList.createdAt,
      })
      .from(contactList)
      .where(where)
      .orderBy(...pageOrder(opts.sort.dir, CONTACT_LIST_SORT[opts.sort.column], contactList.id))
      .limit(opts.size)
      .offset(opts.offset),
    db.select({ n: count() }).from(contactList).where(where),
  ]);
  return { rows, total: Number(totalRow?.n ?? 0) };
}

const CAMPAIGN_SORT = {
  name: campaign.name,
  status: campaign.status,
  createdAt: campaign.createdAt,
} as const;
export type CampaignSortColumn = keyof typeof CAMPAIGN_SORT;
export const CAMPAIGN_SORT_COLUMNS = Object.keys(CAMPAIGN_SORT) as CampaignSortColumn[];

/** Marketing campaigns only: system campaigns (menu reminder) live on their own tab. */
export async function listCampaigns(opts: { filter: SQL | undefined; sort: { column: CampaignSortColumn; dir: "asc" | "desc" }; size: number; offset: number }) {
  const where = and(opts.filter, isNull(campaign.systemKey));
  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        publicId: campaign.publicId,
        name: campaign.name,
        channels: campaign.channels,
        status: campaign.status,
        scheduledAt: campaign.scheduledAt,
        sentAt: campaign.sentAt,
        counts: campaign.counts,
        createdAt: campaign.createdAt,
      })
      .from(campaign)
      .where(where)
      .orderBy(...pageOrder(opts.sort.dir, CAMPAIGN_SORT[opts.sort.column], campaign.id))
      .limit(opts.size)
      .offset(opts.offset),
    db.select({ n: count() }).from(campaign).where(where),
  ]);
  return { rows, total: Number(totalRow?.n ?? 0) };
}

export async function listSystemCampaigns() {
  return db
    .select({ publicId: campaign.publicId, name: campaign.name, sentAt: campaign.sentAt, counts: campaign.counts })
    .from(campaign)
    .where(isNotNull(campaign.systemKey));
}

export async function listContactListChoices() {
  return db
    .select({
      publicId: contactList.publicId,
      name: contactList.name,
      consentSource: contactList.consentSource,
      consentAt: contactList.consentAt,
      memberCount: contactList.memberCount,
    })
    .from(contactList)
    .orderBy(desc(contactList.createdAt));
}
