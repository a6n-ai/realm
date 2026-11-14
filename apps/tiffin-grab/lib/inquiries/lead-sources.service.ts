import { UpdatableRepository } from "@foundry/database";
import type { PgTable } from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { leadSources, leadSubsources } from "@/db/schema";
import { SessionUpdatableService } from "../services/session-service";

class SoftDeleteService<TTable extends PgTable> extends SessionUpdatableService<TTable> {
  async delete(id: string): Promise<number> { await this.update(id, { active: false }); return 1; }
}

export const leadSourceService = new SoftDeleteService(new UpdatableRepository(db, leadSources, leadSources.publicId, leadSources.id));
export const leadSubsourceService = new SoftDeleteService(new UpdatableRepository(db, leadSubsources, leadSubsources.publicId, leadSubsources.id));

/** Sources and sub-sources a staff member can pick on a new order, lead or customer: inactive ones are hidden. */
export async function listActiveLeadSources(): Promise<{ key: string; label: string; subs: { key: string; label: string }[] }[]> {
  const [sourceRows, subRows] = await Promise.all([
    db.select({ id: leadSources.id, key: leadSources.key, label: leadSources.label, active: leadSources.active }).from(leadSources),
    db.select({ sourceId: leadSubsources.sourceId, key: leadSubsources.key, label: leadSubsources.label, active: leadSubsources.active }).from(leadSubsources),
  ]);
  return sourceRows
    .filter((s) => s.active)
    .map((s) => ({
      key: s.key,
      label: s.label,
      subs: subRows.filter((sub) => sub.active && sub.sourceId === s.id).map((sub) => ({ key: sub.key, label: sub.label })),
    }));
}

/**
 * Case-insensitive key/label -> canonical key lookups for the spreadsheet import, scoped so a
 * subsource only resolves within its own parent source.
 */
export async function loadLeadSourceAliases(): Promise<{ sourceByAlias: Map<string, string>; subByParentAndAlias: Map<string, Map<string, string>> }> {
  const sourceRows = await db
    .select({ key: leadSources.key, label: leadSources.label })
    .from(leadSources);
  const subRows = await db
    .select({ key: leadSubsources.key, label: leadSubsources.label, parentKey: leadSources.key })
    .from(leadSubsources)
    .innerJoin(leadSources, eq(leadSubsources.sourceId, leadSources.id));
  const sourceByAlias = new Map<string, string>();
  for (const s of sourceRows) {
    sourceByAlias.set(s.key.toLowerCase(), s.key);
    sourceByAlias.set(s.label.toLowerCase(), s.key);
  }
  const subByParentAndAlias = new Map<string, Map<string, string>>();
  for (const s of subRows) {
    const m = subByParentAndAlias.get(s.parentKey) ?? new Map<string, string>();
    m.set(s.key.toLowerCase(), s.key);
    m.set(s.label.toLowerCase(), s.key);
    subByParentAndAlias.set(s.parentKey, m);
  }
  return { sourceByAlias, subByParentAndAlias };
}
