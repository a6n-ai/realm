import { atomic, newId } from "@foundry/database";
import { sql } from "drizzle-orm";
import type { CrmDb } from "../../db/client";
import type { Actor } from "../auth/actor";
import { ALL_PERMISSIONS } from "../auth/permissions";
import type { Mailer } from "../mail/mailer";
import { createTeamService, type InviteResult } from "../team/service";

export type PlatformAdmin = { userId: string; name: string };
export type OrgRow = { id: string; name: string; slug: string; memberCount: number; createdAt: number };
export type CreateOrgResult = InviteResult | { ok: false; code: "slug_taken" };

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const changed = (res: unknown): number => (res as { meta?: { changes?: number } })?.meta?.changes ?? 0;

// Super admin work. The super admin is never added as a member: inside an organisation they act as its owner only for
// the invite of its first owners, so the invite carries their name and the audit row their id.
export function createPlatformService(db: CrmDb, mailer: Mailer | (() => Mailer), authUrl: string) {
  const asOwner = (admin: PlatformAdmin, organizationId: string): Actor => ({
    userId: admin.userId,
    name: admin.name,
    organizationId,
    role: "owner",
    permissions: ALL_PERMISSIONS,
  });
  const audit = (admin: PlatformAdmin, org: string, action: string, data: Record<string, unknown>) => ({
    onlyIfPreviousChanged: 1 as const,
    query: sql`INSERT INTO audit_log (id, created_at, created_by, organization_id, action, actor_id, target, data)
      SELECT ${newId("aud")}, ${Date.now()}, ${admin.userId}, ${org}, ${action}, ${admin.userId}, ${org}, ${JSON.stringify(data)}`,
  });

  return {
    listOrganizations: () =>
      db
        .all<OrgRow>(sql`SELECT o.id, o.name, o.slug, o.created_at AS createdAt,
          (SELECT count(*) FROM members m WHERE m.organization_id = o.id) AS memberCount
          FROM organizations o ORDER BY o.name, o.id`)
        .then((rows) => rows.map((r) => ({ ...r, memberCount: Number(r.memberCount), createdAt: Number(r.createdAt) }))),

    async createOrganization(
      input: { name: string; slug: string; ownerEmail: string; ownerName: string },
      admin: PlatformAdmin,
    ): Promise<CreateOrgResult> {
      const name = input.name.trim();
      const slug = input.slug.trim();
      if (!name || name.length > 80 || !SLUG.test(slug)) return { ok: false, code: "invalid" };
      const id = newId("org");
      const [ins] = await atomic(db, () => [
        sql`INSERT INTO organizations (id, name, slug, created_at)
          SELECT ${id}, ${name}, ${slug}, ${Date.now()} WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE slug = ${slug})`,
        audit(admin, id, "organization.create", { name, slug }),
      ]);
      if (changed(ins) !== 1) return { ok: false, code: "slug_taken" };
      return createTeamService(db, id, mailer, authUrl).invite(
        { email: input.ownerEmail, name: input.ownerName, role: "owner" },
        asOwner(admin, id),
      );
    },

    async renameOrganization(id: string, name: string, admin: PlatformAdmin): Promise<{ ok: true } | { ok: false; code: "invalid" | "not_found" }> {
      const n = name.trim();
      if (!n || n.length > 80) return { ok: false, code: "invalid" };
      const [upd] = await atomic(db, () => [
        sql`UPDATE organizations SET name = ${n} WHERE id = ${id}`,
        audit(admin, id, "organization.rename", { name: n }),
      ]);
      return changed(upd) === 1 ? { ok: true } : { ok: false, code: "not_found" };
    },

    // An existing member is promoted; anyone else is invited as owner.
    async addOwner(id: string, input: { email: string; name: string }, admin: PlatformAdmin): Promise<InviteResult | { ok: true; promoted: true } | { ok: false; code: "not_found" }> {
      const [org] = await db.all<{ id: string }>(sql`SELECT id FROM organizations WHERE id = ${id}`);
      if (!org) return { ok: false, code: "not_found" };
      const email = input.email.trim().toLowerCase();
      const [upd] = await atomic(db, () => [
        sql`UPDATE members SET role = 'owner'
          WHERE organization_id = ${id} AND user_id = (SELECT id FROM users WHERE email = ${email} AND status = 'active')`,
        audit(admin, id, "organization.add_owner", { email }),
      ]);
      if (changed(upd) === 1) return { ok: true, promoted: true };
      return createTeamService(db, id, mailer, authUrl).invite({ email, name: input.name, role: "owner" }, asOwner(admin, id));
    },
  };
}
