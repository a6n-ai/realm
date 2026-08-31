import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { mapRows, parseCsv } from "./csv";
import type { CampaignRouteDeps } from "./campaign-routes";


export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export const createContactListSchema = z.object({
  name: z.string().trim().min(1),
  consentSource: z.enum(["purchase", "express_optin", "event_signup", "import_other"]),
  consentAt: z.number().int().positive(),
  consentNote: z.string().trim().optional(),
});

export const createContactListFromSegmentSchema = createContactListSchema.extend({
  segment: z.object({
    lastOrderAfter: z.number().int().optional(),
    lastOrderBefore: z.number().int().optional(),
    minOrderCount: z.number().int().positive().optional(),
    minTotalSpend: z.number().positive().optional(),
    requireVerifiedPhone: z.boolean().optional(),
  }),
});

export const importMappingSchema = z.object({
  email: z.string().optional(),
  phone: z.string().optional(),
  name: z.string().optional(),
});

export interface ContactListRow {
  publicId: string;
  name: string;
  consentSource: string;
  consentAt: number;
  consentNote: string | null;
  memberCount: number;
  createdAt: number;
  isSegment: boolean;
}

export async function listContactLists(deps: CampaignRouteDeps): Promise<ContactListRow[]> {
  const { db, tables } = deps;
  const rows = await db
    .select({
      publicId: tables.contactList.publicId,
      name: tables.contactList.name,
      consentSource: tables.contactList.consentSource,
      consentAt: tables.contactList.consentAt,
      consentNote: tables.contactList.consentNote,
      memberCount: tables.contactList.memberCount,
      createdAt: tables.contactList.createdAt,
      segmentDef: tables.contactList.segmentDef,
    })
    .from(tables.contactList)
    .orderBy(sql`${tables.contactList.createdAt} desc`);
  return rows.map((r) => ({ ...r, isSegment: r.segmentDef != null })) as ContactListRow[];
}

export interface CreateContactListInput {
  name: string;
  consentSource: z.infer<typeof createContactListSchema>["consentSource"];
  consentAt: number;
  consentNote?: string;
}

export async function createContactList(
  deps: CampaignRouteDeps,
  input: CreateContactListInput,
): Promise<{ publicId: string }> {
  const { db, tables } = deps;
  const [row] = await db
    .insert(tables.contactList)
    .values(input)
    .returning({ publicId: tables.contactList.publicId });
  return { publicId: row.publicId as string };
}

async function insertMembersAndRecount(
  deps: CampaignRouteDeps,
  listId: bigint,
  members: { email: string | null; phone: string | null; name: string | null; vars: Record<string, string> }[],
): Promise<number> {
  const { db, tables } = deps;
  let imported = 0;
  for (let i = 0; i < members.length; i += 500) {
    const slice = members.slice(i, i + 500);
    const inserted = await db
      .insert(tables.contactListMember)
      .values(slice.map((m) => ({ listId, ...m })))
      // Re-importing/resyncing the same set must not duplicate members.
      .onConflictDoNothing()
      .returning({ id: tables.contactListMember.id });
    imported += inserted.length;
  }
  await db
    .update(tables.contactList)
    .set({
      memberCount: sql`(select count(*) from ${tables.contactListMember} where ${tables.contactListMember.listId} = ${listId})`,
    })
    .where(eq(tables.contactList.id, listId));
  return imported;
}

async function fetchSegmentMembers(
  deps: CampaignRouteDeps,
  segment: z.infer<typeof createContactListFromSegmentSchema>["segment"],
) {
  const { db, users, resolveSegment } = deps;
  const ids = await resolveSegment(segment);
  if (ids.length === 0) return [];

  const select: Record<string, unknown> = { email: users.columns.email };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  select.name = (users.table as any).name;
  if (users.columns.phone) select.phone = users.columns.phone;
  const rows = await db
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .select(select as any)
    .from(users.table)
    .where(inArray(users.columns.id, ids));

  return rows.map((r) => ({
    email: (r.email as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    name: (r.name as string | null) ?? null,
    vars: {},
  }));
}

/**
 * Snapshot a segment (min orders/spend/etc) into a static contact list, same
 * way a CSV import would. Loses live re-evaluation — someone who crosses the
 * threshold later is not added until resynced — that tradeoff is why the
 * segment filters also remain available directly on the campaign audience
 * builder. The segment is stored on the list so it can be resynced later.
 */
export async function createContactListFromSegment(
  deps: CampaignRouteDeps,
  input: z.infer<typeof createContactListFromSegmentSchema>,
): Promise<{ publicId: string; imported: number }> {
  const { db, tables } = deps;
  const { segment, ...listInput } = input;

  const [list] = await db
    .insert(tables.contactList)
    .values({ ...listInput, segmentDef: segment })
    .returning({ id: tables.contactList.id, publicId: tables.contactList.publicId });

  const members = await fetchSegmentMembers(deps, segment);
  const imported = await insertMembersAndRecount(deps, list.id as bigint, members);
  return { publicId: list.publicId as string, imported };
}

/**
 * Re-run a segment-sourced list's query and add anyone new. Never removes
 * existing members — someone who drops below the threshold stays on the
 * list rather than being silently unmailed of something they were told about.
 */
export async function resyncContactList(
  deps: CampaignRouteDeps,
  listPublicId: string,
): Promise<{ imported: number } | { error: string; status: number }> {
  const { db, tables } = deps;
  const [list] = await db
    .select({ id: tables.contactList.id, segmentDef: tables.contactList.segmentDef })
    .from(tables.contactList)
    .where(eq(tables.contactList.publicId, listPublicId));
  if (!list) return { error: "List not found", status: 404 };
  if (!list.segmentDef) return { error: "List was not built from a segment", status: 400 };

  const segment = list.segmentDef as z.infer<typeof createContactListFromSegmentSchema>["segment"];
  const members = await fetchSegmentMembers(deps, segment);
  const imported = await insertMembersAndRecount(deps, list.id as bigint, members);
  return { imported };
}

export async function importContactListMembers(
  deps: CampaignRouteDeps,
  listPublicId: string,
  file: File,
  mapping: { email?: string; phone?: string; name?: string },
): Promise<{ imported: number; rejected: { row: number; reason: string }[] } | { error: string; status: number }> {
  const { db, tables } = deps;

  if (file.size > MAX_IMPORT_BYTES) return { error: "File is larger than 5MB", status: 413 };
  if (!mapping.email && !mapping.phone) return { error: "Map an email or phone column", status: 400 };

  const [list] = await db
    .select({ id: tables.contactList.id })
    .from(tables.contactList)
    .where(eq(tables.contactList.publicId, listPublicId));
  if (!list) return { error: "List not found", status: 404 };

  const { valid, rejected } = mapRows(parseCsv(await file.text()), mapping);
  const imported = await insertMembersAndRecount(
    deps,
    list.id as bigint,
    valid.map((c) => ({ email: c.email ?? null, phone: c.phone ?? null, name: c.name ?? null, vars: c.vars })),
  );

  return { imported, rejected };
}
