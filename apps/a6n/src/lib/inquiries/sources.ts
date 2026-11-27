import { atomic, newId, type BatchItem } from "@foundry/database";
import { sql } from "drizzle-orm";
import type { CrmDb } from "../../db/client";
import type { Actor } from "./service";

export type SourceRow = { id: string; key: string; label: string; active: boolean };
export type SubsourceRow = SourceRow & { sourceId: string };
export type SourceResult = { ok: true; id?: string } | { ok: false; code: "invalid" | "stale" };

const KEY = /^[a-z0-9_]{1,50}$/;
const changed = (res: unknown): number => (res as { meta?: { changes?: number } })?.meta?.changes ?? 0;

const audit = (action: string, actor: Actor, target: string, data: Record<string, unknown>): BatchItem => ({
  onlyIfPreviousChanged: 1,
  query: sql`INSERT INTO audit_log (id, created_at, created_by, action, actor_id, target, data)
    SELECT ${newId("aud")}, ${Date.now()}, ${actor.userId}, ${action}, ${actor.userId}, ${target}, ${JSON.stringify(data)}`,
});

export function createSourcesService(db: CrmDb) {
  const sources = (where: ReturnType<typeof sql>) =>
    db.all<SourceRow & { subsources?: never }>(
      sql`SELECT id, key, label, active = 1 AS active FROM lead_sources ${where} ORDER BY label`,
    );
  const subsources = (where: ReturnType<typeof sql>) =>
    db.all<SubsourceRow>(
      sql`SELECT id, source_id AS sourceId, key, label, active = 1 AS active FROM lead_subsources ${where} ORDER BY label`,
    );

  const toggle = async (table: "lead_sources" | "lead_subsources", id: string, active: boolean, actor: Actor, action: string) => {
    const [upd] = await atomic(db, () => [
      sql`UPDATE ${sql.raw(table)} SET active = ${active ? 1 : 0} WHERE id = ${id} AND active <> ${active ? 1 : 0}`,
      audit(action, actor, id, { active }),
    ]);
    return changed(upd) === 1 ? ({ ok: true } as const) : ({ ok: false, code: "stale" } as const);
  };

  return {
    listActive: async () => ({
      sources: await sources(sql`WHERE active = 1`),
      subsources: await subsources(sql`WHERE active = 1`),
    }),
    listAll: async () => ({ sources: await sources(sql``), subsources: await subsources(sql``) }),

    async create(input: { key: string; label: string }, actor: Actor): Promise<SourceResult> {
      const label = input.label.trim();
      if (!KEY.test(input.key) || !label) return { ok: false, code: "invalid" };
      const id = newId("lsr");
      const [ins] = await atomic(db, () => [
        sql`INSERT INTO lead_sources (id, created_at, created_by, key, label)
          SELECT ${id}, ${Date.now()}, ${actor.userId}, ${input.key}, ${label}
          WHERE NOT EXISTS (SELECT 1 FROM lead_sources WHERE key = ${input.key})`,
        audit("source.create", actor, id, { key: input.key, label }),
      ]);
      return changed(ins) === 1 ? { ok: true, id } : { ok: false, code: "invalid" };
    },

    async rename(id: string, label: string, actor: Actor): Promise<SourceResult> {
      const next = label.trim();
      if (!next) return { ok: false, code: "invalid" };
      const [upd] = await atomic(db, () => [
        sql`UPDATE lead_sources SET label = ${next} WHERE id = ${id} AND label <> ${next}`,
        audit("source.rename", actor, id, { label: next }),
      ]);
      return changed(upd) === 1 ? { ok: true } : { ok: false, code: "stale" };
    },

    setActive: (id: string, active: boolean, actor: Actor) => toggle("lead_sources", id, active, actor, "source.set_active"),

    async addSubsource(sourceId: string, input: { key: string; label: string }, actor: Actor): Promise<SourceResult> {
      const label = input.label.trim();
      if (!KEY.test(input.key) || !label) return { ok: false, code: "invalid" };
      const id = newId("lss");
      const [ins] = await atomic(db, () => [
        sql`INSERT INTO lead_subsources (id, created_at, created_by, source_id, key, label)
          SELECT ${id}, ${Date.now()}, ${actor.userId}, s.id, ${input.key}, ${label}
          FROM lead_sources s WHERE s.id = ${sourceId}
            AND NOT EXISTS (SELECT 1 FROM lead_subsources WHERE source_id = s.id AND key = ${input.key})`,
        audit("subsource.create", actor, id, { sourceId, key: input.key, label }),
      ]);
      return changed(ins) === 1 ? { ok: true, id } : { ok: false, code: "invalid" };
    },

    async renameSubsource(id: string, label: string, actor: Actor): Promise<SourceResult> {
      const next = label.trim();
      if (!next) return { ok: false, code: "invalid" };
      const [upd] = await atomic(db, () => [
        sql`UPDATE lead_subsources SET label = ${next} WHERE id = ${id} AND label <> ${next}`,
        audit("subsource.rename", actor, id, { label: next }),
      ]);
      return changed(upd) === 1 ? { ok: true } : { ok: false, code: "stale" };
    },

    setSubsourceActive: (id: string, active: boolean, actor: Actor) =>
      toggle("lead_subsources", id, active, actor, "subsource.set_active"),
  };
}

export type SourcesService = ReturnType<typeof createSourcesService>;
