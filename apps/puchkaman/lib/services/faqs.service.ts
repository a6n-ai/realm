import { and, asc, eq, isNull } from "drizzle-orm";
import { UpdatableRepository } from "@foundry/database";
import { db } from "@/db/client";
import { publicFaqs } from "@/db/schema";
import { resolveActingOrgId } from "@/lib/services/integrations.service";
import { orgScopeWhereForAdmin } from "@/lib/services/org-scope";
import { SessionUpdatableService } from "@/lib/services/session-service";

export type Faq = { publicId: string; question: string; answer: string; sortOrder: number; active: boolean };

type FaqRow = { publicId?: string; question: string; answer: string; sortOrder: number; active: boolean };

function rowToFaq(row: FaqRow): Faq {
  return { publicId: row.publicId ?? "", question: row.question, answer: row.answer, sortOrder: row.sortOrder, active: row.active };
}

class FaqService extends SessionUpdatableService<typeof publicFaqs> {}
const faqService = new FaqService(new UpdatableRepository(db, publicFaqs, publicFaqs.publicId, publicFaqs.id));

/**
 * Public FAQ, override — not union — scoped: a franchise with its own active
 * rows sees only those, not the brand's rows in addition (they'd usually be
 * "our hours are X" answers, which can't both apply). Falls back to the
 * brand's null-org rows when the active franchise has none of its own, so a
 * fresh franchise isn't left with an empty FAQ before anyone edits it.
 */
export async function listPublicFaqs(): Promise<Faq[]> {
  const orgId = await resolveActingOrgId();
  if (orgId) {
    const ownRows = await db
      .select()
      .from(publicFaqs)
      .where(and(eq(publicFaqs.organizationId, orgId), eq(publicFaqs.active, true)))
      .orderBy(asc(publicFaqs.sortOrder));
    if (ownRows.length) return ownRows.map(rowToFaq);
  }

  const brandRows = await db
    .select()
    .from(publicFaqs)
    .where(and(isNull(publicFaqs.organizationId), eq(publicFaqs.active, true)))
    .orderBy(asc(publicFaqs.sortOrder));
  return brandRows.map(rowToFaq);
}

/** Admin listing — retired rows included, org-scoped the same way every other admin listing is (see org-scope.ts). */
export async function listAllFaqs(): Promise<Faq[]> {
  const rows = await db
    .select()
    .from(publicFaqs)
    .where(await orgScopeWhereForAdmin(publicFaqs.organizationId))
    .orderBy(asc(publicFaqs.sortOrder));
  return rows.map(rowToFaq);
}

export async function saveFaq(publicId: string | null, values: Record<string, unknown>): Promise<Faq> {
  const row = publicId ? await faqService.update(publicId, values) : await faqService.create(values);
  return rowToFaq(row as unknown as FaqRow);
}

export async function retireFaq(publicId: string): Promise<Faq> {
  const row = await faqService.update(publicId, { active: false });
  return rowToFaq(row as unknown as FaqRow);
}
