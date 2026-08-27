"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { assertHierarchyDepth } from "@realm/auth";
import { db } from "@/db/client";
import { member, organization, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";

export type CreateFranchiseResult = { ok: true; id: string } | { ok: false; error: string };

// Better-auth's internal user id is the stringified users.id bigint, never the
// publicId getSession() exposes (see lib/auth/session.ts) — resolve it here.
// Unlike tiffin-grab, puchkaman's users table has no `isSystem` row to fall
// back on (confirmed: no such column in db/schema/auth.ts), so the fallback
// here is the oldest admin user instead, for a script/no-session caller.
async function resolveActingUserId(): Promise<bigint | null> {
  const session = await getSession();
  if (session?.user.id) {
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, session.user.id)).limit(1);
    if (row) return row.id;
  }
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).orderBy(users.id).limit(1);
  return admin?.id ?? null;
}

// DEVIATION FROM THE BRIEF: this does not call `auth.api.createOrganization`.
//
// Two real problems surfaced going through the org plugin's own endpoint:
//   1. `parentOrganizationId` is `input: false` on the plugin (lib/auth/index.ts) —
//      better-auth's toZodSchema drops input:false additionalFields from the create
//      body's zod schema UNCONDITIONALLY (it hardcodes isClientSide: true in
//      node_modules/better-auth/dist/plugins/organization/routes/crud-org.mjs), so
//      the field is stripped before organizationHooks.beforeCreateOrganization ever
//      sees it — there is no way to set it through auth.api.createOrganization, from
//      the server or otherwise. The index.ts comment already flags this as
//      "unreachable via the public API today."
//   2. auth.api.createOrganization's own adapter call fails outright in this app:
//      `betterAuth`'s drizzleAdapter is configured with
//      `schema: { user, account, session, verification }` only (lib/auth/index.ts) —
//      "organization" and "member" are never registered with the adapter, so the org
//      plugin's internal getOrgAdapter throws
//      `BetterAuthError: The model "member" was not found in the schema object`
//      the moment it tries to create the owner membership row. Fixing that is a
//      change to the shared auth config, out of scope for this task.
//
// So we do what seed-brand-org.ts already does for the brand org: write the
// organization + owner member rows directly, after re-running the same depth guard
// the (unreachable) plugin hook was meant to enforce.
export async function createFranchise(
  brandOrganizationId: string,
  name: string,
  clientCode: string,
): Promise<CreateFranchiseResult> {
  await requireAdmin();
  try {
    const actingUserId = await resolveActingUserId();
    if (!actingUserId) return { ok: false, error: "No user available to create this organization." };

    const createdId = await db.transaction(async (tx) => {
      const [parent] = await tx
        .select({ id: organization.id, parentOrganizationId: organization.parentOrganizationId })
        .from(organization)
        .where(eq(organization.id, brandOrganizationId))
        .limit(1);
      assertHierarchyDepth(parent ?? null);

      const [created] = await tx
        .insert(organization)
        .values({ name, slug: clientCode, clientCode, parentOrganizationId: brandOrganizationId })
        .returning({ id: organization.id });
      if (!created) throw new Error("Organization creation failed.");

      await tx.insert(member).values({ organizationId: created.id, userId: actingUserId, role: "owner" });
      return created.id;
    });

    revalidatePath("/dashboard/organization/clients");
    return { ok: true, id: createdId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Organization creation failed." };
  }
}
