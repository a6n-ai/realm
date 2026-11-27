import { atomic, newId, type BatchItem } from "@foundry/database";
import { sql } from "drizzle-orm";
import type { CrmDb } from "../../db/client";
import type { Actor } from "./service";

export type SourceRow = { id: string; key: string; label: string; active: boolean };
export type SubsourceRow = SourceRow & { sourceId: string };
export type SourceResult = { ok: true; id?: string } | { ok: false; code: "invalid" | "stale" };

const KEY = /^[a-z0-9_]{1,50}$/;
const changed = (res: unknown): number => (res as { meta?: { changes?: number } })?.meta?.changes ?? 0;

const audit = (org: string, action: string, actor: Actor, target: string, data: Record<string, unknown>): BatchItem => ({
  onlyIfPreviousChanged: 1,
  query: sql`INSERT INTO audit_log (id, created_at, created_by, organization_id, action, actor_id, target, data)
    SELECT ${newId("aud")}, ${Date.now()}, ${actor.userId}, ${org}, ${action}, ${actor.userId}, ${target}, ${JSON.stringify(data)}`,
});

// Bound to one organisation: sources and sub-sources of another organisation are invisible and unchangeable.
export function createSourcesService(db: CrmDb, org: string) {
  const sources = (where: ReturnType<typeof sql>) =>
    db.all<SourceRow & { subsources?: never }>(
      sql`SELECT id, key, label, active = 1 AS active FROM lead_sources WHERE organization_id = ${org} ${where} ORDER BY label`,
    );
  const subsources = (where: ReturnType<typeof sql>) =>
    db.all<SubsourceRow>(
      sql`SELECT id, source_id AS sourceId, key, label, active = 1 AS active FROM lead_subsources WHERE organization_id = ${org} ${where} ORDER BY label`,
    );

  const toggle = async (table: "lead_sources" | "lead_subsources", id: string, active: boolean, actor: Actor, action: string) => {
    const [upd] = await atomic(db, () => [
      sql`UPDATE ${sql.raw(table)} SET active = ${active ? 1 : 0} WHERE id = ${id} AND organization_id = ${org} AND active <> ${active ? 1 : 0}`,
      audit(org, action, actor, id, { active }),
    ]);
    return changed(upd) === 1 ? ({ ok: true } as const) : ({ ok: false, code: "stale" } as const);
  };

  return {
    listActive: async () => ({
      sources: await sources(sql`AND active = 1`),
      subsources: await subsources(sql`AND active = 1`),
    }),
    listAll: async () => ({ sources: await sources(sql``), subsources: await subsources(sql``) }),

    async create(input: { key: string; label: string }, actor: Actor): Promise<SourceResult> {
      const label = input.label.trim();
      if (!KEY.test(input.key) || !label) return { ok: false, code: "invalid" };
      const id = newId("lsr");
      const [ins] = await atomic(db, () => [
        sql`INSERT INTO lead_sources (id, created_at, created_by, organization_id, key, label)
          SELECT ${id}, ${Date.now()}, ${actor.userId}, ${org}, ${input.key}, ${label}
          WHERE NOT EXISTS (SELECT 1 FROM lead_sources WHERE organization_id = ${org} AND key = ${input.key})`,
        audit(org, "source.create", actor, id, { key: input.key, label }),
      ]);
      return changed(ins) === 1 ? { ok: true, id } : { ok: false, code: "invalid" };
    },

    async rename(id: string, label: string, actor: Actor): Promise<SourceResult> {
      const next = label.trim();
      if (!next) return { ok: false, code: "invalid" };
      const [upd] = await atomic(db, () => [
        sql`UPDATE lead_sources SET label = ${next} WHERE id = ${id} AND organization_id = ${org} AND label <> ${next}`,
        audit(org, "source.rename", actor, id, { label: next }),
      ]);
      return changed(upd) === 1 ? { ok: true } : { ok: false, code: "stale" };
    },

    setActive: (id: string, active: boolean, actor: Actor) => toggle("lead_sources", id, active, actor, "source.set_active"),

    async addSubsource(sourceId: string, input: { key: string; label: string }, actor: Actor): Promise<SourceResult> {
      const label = input.label.trim();
      if (!KEY.test(input.key) || !label) return { ok: false, code: "invalid" };
      const id = newId("lss");
      const [ins] = await atomic(db, () => [
        sql`INSERT INTO lead_subsources (id, created_at, created_by, organization_id, source_id, key, label)
          SELECT ${id}, ${Date.now()}, ${actor.userId}, ${org}, s.id, ${input.key}, ${label}
          FROM lead_sources s WHERE s.id = ${sourceId} AND s.organization_id = ${org}
            AND NOT EXISTS (SELECT 1 FROM lead_subsources WHERE source_id = s.id AND key = ${input.key})`,
        audit(org, "subsource.create", actor, id, { sourceId, key: input.key, label }),
      ]);
      return changed(ins) === 1 ? { ok: true, id } : { ok: false, code: "invalid" };
    },

    async renameSubsource(id: string, label: string, actor: Actor): Promise<SourceResult> {
      const next = label.trim();
      if (!next) return { ok: false, code: "invalid" };
      const [upd] = await atomic(db, () => [
        sql`UPDATE lead_subsources SET label = ${next} WHERE id = ${id} AND organization_id = ${org} AND label <> ${next}`,
        audit(org, "subsource.rename", actor, id, { label: next }),
      ]);
      return changed(upd) === 1 ? { ok: true } : { ok: false, code: "stale" };
    },

    setSubsourceActive: (id: string, active: boolean, actor: Actor) =>
      toggle("lead_subsources", id, active, actor, "subsource.set_active"),
  };
}

export type SourcesService = ReturnType<typeof createSourcesService>;
