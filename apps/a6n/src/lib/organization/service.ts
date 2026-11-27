import { atomic, newId } from "@foundry/database";
import { sql } from "drizzle-orm";
import type { CrmDb } from "../../db/client";
import type { Actor } from "../auth/actor";

const changed = (res: unknown): number => (res as { meta?: { changes?: number } })?.meta?.changes ?? 0;

// The organisation comes from the actor: nobody renames an organisation they are not working in.
export async function renameOwnOrganization(db: CrmDb, name: string, actor: Actor): Promise<{ ok: true } | { ok: false; code: "invalid" | "not_found" }> {
  const n = name.trim().replace(/\s+/g, " ");
  if (!n || n.length > 80) return { ok: false, code: "invalid" };
  const [upd] = await atomic(db, () => [
    sql`UPDATE organizations SET name = ${n} WHERE id = ${actor.organizationId}`,
    {
      onlyIfPreviousChanged: 1,
      query: sql`INSERT INTO audit_log (id, created_at, created_by, organization_id, action, actor_id, target, data)
        SELECT ${newId("aud")}, ${Date.now()}, ${actor.userId}, ${actor.organizationId}, 'organization.rename', ${actor.userId},
          ${actor.organizationId}, ${JSON.stringify({ name: n })}`,
    },
  ]);
  return changed(upd) === 1 ? { ok: true } : { ok: false, code: "not_found" };
}
