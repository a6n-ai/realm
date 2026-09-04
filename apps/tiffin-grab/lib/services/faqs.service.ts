import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { UpdatableRepository } from "@foundry/database";
import { db } from "@/db/client";
import { publicFaqs } from "@/db/schema";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";
import { SessionUpdatableService } from "@/lib/services/session-service";

export type Faq = { publicId: string; question: string; answer: string; sortOrder: number; active: boolean };

type FaqRow = { publicId?: string; question: string; answer: string; sortOrder: number; active: boolean };

function rowToFaq(row: FaqRow): Faq {
  return { publicId: row.publicId ?? "", question: row.question, answer: row.answer, sortOrder: row.sortOrder, active: row.active };
}

class FaqService extends SessionUpdatableService<typeof publicFaqs> {}
const faqService = new FaqService(new UpdatableRepository(db, publicFaqs, publicFaqs.publicId, publicFaqs.id));

/**
 * Public FAQ, override — not union — scoped: an org with its own active rows
 * sees only those, not the brand's rows in addition. Falls back to the
 * brand's null-org rows when the acting org (resolveRequestOrg — the URL/
 * cookie-resolved franchise, see proxy.ts) has none of its own. This app has
 * exactly one org today (see resolveBrandOrgId in orders.service.ts), so the
 * override branch is inert until franchise creation ships — same shape as
 * apps/puchkaman/lib/services/faqs.service.ts either way.
 */
export async function listPublicFaqs(): Promise<Faq[]> {
  const orgId = await resolveRequestOrg();
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

/**
 * Admin listing — retired rows included, scoped the same way listOrdersPage
 * is (resolveSessionVisibleOrgIds): "all" for super_admin, else the caller's
 * member orgs. Brand-shared rows (organizationId null) are always visible —
 * they're the fallback every org's public page reads when it has no override.
 */
export async function listAllFaqs(visible: "all" | string[]): Promise<Faq[]> {
  const rows = await db
    .select()
    .from(publicFaqs)
    .where(visible === "all" ? undefined : or(isNull(publicFaqs.organizationId), inArray(publicFaqs.organizationId, visible)))
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
