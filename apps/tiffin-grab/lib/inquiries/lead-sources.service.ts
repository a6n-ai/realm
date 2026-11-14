import { UpdatableRepository } from "@foundry/database";
import type { PgTable } from "drizzle-orm/pg-core";
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
