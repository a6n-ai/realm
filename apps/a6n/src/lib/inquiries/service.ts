import { atomic, newId, type BatchItem } from "@foundry/database";
import { sql } from "drizzle-orm";
import type { CrmDb } from "../../db/client";
import { toE164 } from "../phone";
import { toNameKey } from "./companies";
import { InquiriesRepository, listForView, unassignedCounts } from "./repository";
import { reopen as reopenRules, transition, ValidationError } from "./stages";

export type Actor = { userId: string };
export type RefusalCode = "already_claimed" | "stale" | "inactive_source" | "invalid";
export type Refusal = { ok: false; code: RefusalCode };
export type Inquiry = NonNullable<Awaited<ReturnType<InquiriesRepository["findByPublicId"]>>>;

export type IngestInput = {
  source: string;
  subSource?: string | null;
  contact: { name?: string | null; phone?: string | null; email?: string | null };
  company?: string | null;
  requirements?: string | null;
  ownerId?: string | null;
  nextFollowUpAt: number;
  externalId?: string | null;
  createdVia: string;
};

export type ContactPatch = {
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  requirements?: string | null;
};

const ACTIVITY_TYPES = ["note", "call", "whatsapp", "email"] as const;
const invalid: Refusal = { ok: false, code: "invalid" };
const clean = (s: string | null | undefined): string | null => s?.trim() || null;
const isTime = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

// Drizzle's D1 batch returns one D1Result per statement; meta.changes is that statement's row count.
const changed = (res: unknown): number => (res as { meta?: { changes?: number } })?.meta?.changes ?? 0;

// Bound to one organisation: every read and write below is limited to it, and people outside it never own its rows.
export function createInquiriesService(db: CrmDb, org: string) {
  const repo = new InquiriesRepository(db);
  const inOrg = async (id: string) =>
    (await db.all<{ id: string }>(sql`SELECT id FROM inquiries WHERE id = ${id} AND organization_id = ${org}`)).length > 0;

  const refuseWhenUnchanged = async (id: string, fallback: RefusalCode): Promise<Refusal> => {
    return { ok: false, code: (await inOrg(id)) ? fallback : "stale" };
  };

  return {
    async ingest(input: IngestInput, actor: Actor): Promise<{ ok: true; inquiry: Inquiry; created: boolean } | Refusal> {
      const name = clean(input.contact.name);
      const phone = toE164(input.contact.phone);
      if ((!name && !phone) || !isTime(input.nextFollowUpAt) || !input.source || !input.createdVia) return invalid;
      const companyName = clean(input.company)?.replace(/\s+/g, " ") ?? null;
      const nameKey = companyName ? toNameKey(companyName) : null;
      const subKey = clean(input.subSource);
      const externalId = clean(input.externalId);
      const newInquiryId = newId("inq");
      const now = Date.now();
      const owner = clean(input.ownerId);

      await atomic(db, () => {
        const items: BatchItem[] = [];
        if (companyName && nameKey) {
          items.push(sql`INSERT INTO companies (id, created_at, created_by, organization_id, name, name_key)
            SELECT ${newId("cmp")}, ${now}, ${actor.userId}, ${org}, ${companyName}, ${nameKey}
            WHERE NOT EXISTS (SELECT 1 FROM companies WHERE organization_id = ${org} AND name_key = ${nameKey})`);
        }
        // Raw SQL: Drizzle's onConflictDoNothing({ where }) emits invalid SQL for a partial-index target.
        items.push(sql`INSERT INTO inquiries (id, created_at, created_by, organization_id, contact_name, phone, email, company_id,
            source_id, sub_source_id, requirements, stage, owner_id, next_follow_up_at, external_id, created_via)
          SELECT ${newInquiryId}, ${now}, ${actor.userId}, ${org}, ${name}, ${phone}, ${clean(input.contact.email)},
            (SELECT id FROM companies WHERE organization_id = ${org} AND name_key = ${nameKey}),
            s.id,
            (SELECT ss.id FROM lead_subsources ss WHERE ss.source_id = s.id AND ss.key = ${subKey} AND ss.active),
            ${clean(input.requirements)}, 'new',
            (SELECT u.id FROM users u WHERE u.id = ${owner} AND u.status = 'active'
              AND EXISTS (SELECT 1 FROM members m WHERE m.user_id = u.id AND m.organization_id = ${org})),
            ${input.nextFollowUpAt}, ${externalId}, ${input.createdVia}
          FROM lead_sources s
          WHERE s.key = ${input.source} AND s.active AND s.organization_id = ${org}
            AND (${subKey} IS NULL OR EXISTS (
              SELECT 1 FROM lead_subsources ss WHERE ss.source_id = s.id AND ss.key = ${subKey} AND ss.active))
          ON CONFLICT(source_id, external_id) WHERE external_id IS NOT NULL DO NOTHING`);
        items.push({
          onlyIfPreviousChanged: 1,
          query: sql`INSERT INTO inquiry_activities (id, created_at, organization_id, inquiry_id, type, to_stage, to_owner_id, actor_id)
            SELECT ${newId("iac")}, ${now}, ${org}, ${newInquiryId}, 'created', 'new',
              (SELECT owner_id FROM inquiries WHERE id = ${newInquiryId}), ${actor.userId}`,
        });
        return items;
      });

      const found = externalId
        ? (
            await db.all<{ id: string }>(sql`SELECT i.id FROM inquiries i JOIN lead_sources s ON s.id = i.source_id
              WHERE s.key = ${input.source} AND i.external_id = ${externalId} AND i.organization_id = ${org}`)
          )[0]
        : (await db.all<{ id: string }>(sql`SELECT id FROM inquiries WHERE id = ${newInquiryId} AND organization_id = ${org}`))[0];
      const inquiry = found && (await repo.findByPublicId(found.id));
      if (!found || !inquiry) return { ok: false, code: "inactive_source" };
      return { ok: true, inquiry, created: found.id === newInquiryId };
    },

    async changeStage(
      id: string,
      from: string,
      to: string,
      opts: { lostReason?: string | null },
      actor: Actor,
    ): Promise<{ ok: true } | Refusal> {
      const now = Date.now();
      let t: ReturnType<typeof transition>;
      try {
        t = transition(from, to, { lostReason: opts.lostReason, now });
      } catch (e) {
        if (e instanceof ValidationError) return invalid;
        throw e;
      }
      const { patch, activity } = t;
      const [upd] = await atomic(db, () => [
        sql`UPDATE inquiries SET stage = ${patch.stage}, lost_reason = ${patch.lostReason}
          ${patch.closedAt === undefined ? sql`` : sql`, closed_at = ${patch.closedAt}, next_follow_up_at = NULL`}
          WHERE id = ${id} AND organization_id = ${org} AND stage = ${from} AND closed_at IS NULL`,
        {
          onlyIfPreviousChanged: 1,
          query: sql`INSERT INTO inquiry_activities (id, created_at, organization_id, inquiry_id, type, from_stage, to_stage, actor_id)
            SELECT ${newId("iac")}, ${now}, ${org}, ${id}, ${activity.type}, ${activity.fromStage}, ${activity.toStage}, ${actor.userId}`,
        },
      ]);
      return changed(upd) === 1 ? { ok: true } : { ok: false, code: "stale" };
    },

    async reopen(id: string, stage: string, nextFollowUpAt: number, actor: Actor): Promise<{ ok: true } | Refusal> {
      try {
        reopenRules("won", stage, nextFollowUpAt);
      } catch (e) {
        if (e instanceof ValidationError) return invalid;
        throw e;
      }
      const now = Date.now();
      // lost_reason is cleared last: the activity derives fromStage from it, since the update already overwrote stage.
      const [upd] = await atomic(db, () => [
        sql`UPDATE inquiries SET stage = ${stage}, closed_at = NULL, next_follow_up_at = ${nextFollowUpAt},
            owner_id = CASE WHEN EXISTS (SELECT 1 FROM users u WHERE u.id = owner_id AND u.status = 'active'
              AND EXISTS (SELECT 1 FROM members m WHERE m.user_id = u.id AND m.organization_id = ${org})) THEN owner_id ELSE NULL END
          WHERE id = ${id} AND organization_id = ${org} AND closed_at IS NOT NULL`,
        {
          onlyIfPreviousChanged: 1,
          query: sql`INSERT INTO inquiry_activities (id, created_at, organization_id, inquiry_id, type, from_stage, to_stage, actor_id)
            SELECT ${newId("iac")}, ${now}, ${org}, id, 'reopened',
              CASE WHEN lost_reason IS NOT NULL THEN 'lost' ELSE 'won' END, ${stage}, ${actor.userId}
            FROM inquiries WHERE id = ${id}`,
        },
        sql`UPDATE inquiries SET lost_reason = NULL WHERE id = ${id} AND organization_id = ${org} AND closed_at IS NULL AND lost_reason IS NOT NULL`,
      ]);
      return changed(upd) === 1 ? { ok: true } : { ok: false, code: "stale" };
    },

    async addActivity(id: string, input: { type: string; note: string }, actor: Actor): Promise<{ ok: true } | Refusal> {
      const note = clean(input.note);
      if (!(ACTIVITY_TYPES as readonly string[]).includes(input.type) || !note) return invalid;
      const [res] = await atomic(db, () => [
        sql`INSERT INTO inquiry_activities (id, created_at, organization_id, inquiry_id, type, note, actor_id)
          SELECT ${newId("iac")}, ${Date.now()}, ${org}, id, ${input.type}, ${note}, ${actor.userId}
          FROM inquiries WHERE id = ${id} AND organization_id = ${org}`,
      ]);
      return changed(res) === 1 ? { ok: true } : { ok: false, code: "stale" };
    },

    async setFollowUp(id: string, at: number, _actor: Actor): Promise<{ ok: true } | Refusal> {
      if (!isTime(at)) return invalid;
      const [res] = await atomic(db, () => [
        sql`UPDATE inquiries SET next_follow_up_at = ${at} WHERE id = ${id} AND organization_id = ${org} AND closed_at IS NULL`,
      ]);
      return changed(res) === 1 ? { ok: true } : { ok: false, code: "stale" };
    },

    async claim(id: string, actor: Actor): Promise<{ ok: true } | Refusal> {
      const [upd] = await atomic(db, () => [
        sql`UPDATE inquiries SET owner_id = ${actor.userId}
          WHERE id = ${id} AND organization_id = ${org} AND owner_id IS NULL AND closed_at IS NULL
          AND EXISTS (SELECT 1 FROM users WHERE id = ${actor.userId} AND status = 'active')
          AND EXISTS (SELECT 1 FROM members m WHERE m.user_id = ${actor.userId} AND m.organization_id = ${org})`,
        {
          onlyIfPreviousChanged: 1,
          query: sql`INSERT INTO inquiry_activities (id, created_at, organization_id, inquiry_id, type, from_owner_id, to_owner_id, actor_id)
            SELECT ${newId("iac")}, ${Date.now()}, ${org}, ${id}, 'reassigned', NULL, ${actor.userId}, ${actor.userId}`,
        },
      ]);
      return changed(upd) === 1 ? { ok: true } : refuseWhenUnchanged(id, "already_claimed");
    },

    async assign(
      id: string,
      fromOwnerId: string | null,
      toOwnerId: string,
      actor: Actor,
    ): Promise<{ ok: true } | Refusal> {
      if (!toOwnerId || fromOwnerId === toOwnerId) return invalid;
      const [upd] = await atomic(db, () => [
        sql`UPDATE inquiries SET owner_id = ${toOwnerId}
          WHERE id = ${id} AND organization_id = ${org} AND owner_id IS ${fromOwnerId}
            AND EXISTS (SELECT 1 FROM users WHERE id = ${toOwnerId} AND status = 'active')
            AND EXISTS (SELECT 1 FROM members m WHERE m.user_id = ${toOwnerId} AND m.organization_id = ${org})`,
        {
          onlyIfPreviousChanged: 1,
          query: sql`INSERT INTO inquiry_activities (id, created_at, organization_id, inquiry_id, type, from_owner_id, to_owner_id, actor_id)
            SELECT ${newId("iac")}, ${Date.now()}, ${org}, ${id}, 'reassigned', ${fromOwnerId}, ${toOwnerId}, ${actor.userId}`,
        },
      ]);
      return changed(upd) === 1 ? { ok: true } : { ok: false, code: "stale" };
    },

    async updateContact(id: string, patch: ContactPatch, _actor: Actor): Promise<{ ok: true } | Refusal> {
      if (patch.phone !== undefined) patch = { ...patch, phone: toE164(patch.phone) };
      const cols = { contactName: "contact_name", phone: "phone", email: "email", requirements: "requirements" } as const;
      const keys = (Object.keys(cols) as (keyof ContactPatch)[]).filter((k) => patch[k] !== undefined);
      if (keys.length === 0) return invalid;
      const next = (k: keyof ContactPatch) => (patch[k] === undefined ? sql.raw(cols[k]) : sql`${clean(patch[k])}`);
      const sets = sql.join(keys.map((k) => sql`${sql.raw(cols[k])} = ${clean(patch[k])}`), sql`, `);
      const [res] = await atomic(db, () => [
        sql`UPDATE inquiries SET ${sets}
          WHERE id = ${id} AND organization_id = ${org} AND (${next("contactName")} IS NOT NULL OR ${next("phone")} IS NOT NULL)`,
      ]);
      return changed(res) === 1 ? { ok: true } : refuseWhenUnchanged(id, "invalid");
    },

    listForView: (args: Omit<Parameters<typeof listForView>[1], "organizationId">) => listForView(db, { ...args, organizationId: org }),
    unassignedCounts: (now?: number) => unassignedCounts(db, org, now),
  };
}

export type InquiriesService = ReturnType<typeof createInquiriesService>;
