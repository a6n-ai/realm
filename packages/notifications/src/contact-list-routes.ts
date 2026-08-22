import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { mapRows, parseCsv } from "./csv";
import type { CampaignRouteDeps } from "./campaign-routes";

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

export const createContactListSchema = z.object({
  name: z.string().trim().min(1),
  consentSource: z.enum(["purchase", "express_optin", "event_signup", "import_other"]),
  consentAt: z.number().int().positive(),
  consentNote: z.string().trim().optional(),
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
    })
    .from(tables.contactList)
    .orderBy(sql`${tables.contactList.createdAt} desc`);
  return rows as ContactListRow[];
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

  let imported = 0;
  for (let i = 0; i < valid.length; i += 500) {
    const slice = valid.slice(i, i + 500);
    const inserted = await db
      .insert(tables.contactListMember)
      .values(
        slice.map((c) => ({
          listId: list.id,
          email: c.email ?? null,
          phone: c.phone ?? null,
          name: c.name ?? null,
          vars: c.vars,
        })),
      )
      // Re-importing the same export must not duplicate members.
      .onConflictDoNothing()
      .returning({ id: tables.contactListMember.id });
    imported += inserted.length;
  }

  await db
    .update(tables.contactList)
    .set({
      memberCount: sql`(select count(*) from ${tables.contactListMember} where ${tables.contactListMember.listId} = ${list.id})`,
    })
    .where(eq(tables.contactList.id, list.id));

  return { imported, rejected };
}
