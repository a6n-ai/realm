"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { assertHierarchyDepth } from "@realm/auth";
import { db } from "@/db/client";
import { member, organization, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { resolveOrgScopeMode } from "@/lib/services/org-scope";
import {
  addMember,
  deriveUniqueClientCode,
  removeMember,
  searchUsersByEmail,
  updateMemberRole,
  updateOrganization,
  type MemberRole,
  type UpdateOrganizationInput,
  type UpdateOrganizationResult,
  type UserSearchRow,
} from "./organizations.service";

export type CreateFranchiseResult = { ok: true; id: string } | { ok: false; error: string };

// requireAdmin only checks the global admin role — it has no idea which
// org the caller is scoped to. Without this, any admin-role staff member,
// regardless of which franchise the UI has them scoped to, could call these
// actions directly with an arbitrary organizationId (another franchise's, or
// the brand's) and add/remove members, edit org details, or read member rows
// they have no business seeing. "all" (brand/super_admin) passes for any org;
// a franchise session passes only for its own id.
async function assertOrgInScope(organizationId: string): Promise<void> {
  const scopeMode = await resolveOrgScopeMode();
  if (scopeMode.mode === "all") return;
  if (scopeMode.orgId === organizationId) return;
  throw new Error("Not authorized for this organization.");
}

// Better-auth's internal user id is the stringified users.id bigint, never the
// publicId getSession() exposes (see lib/auth/session.ts) — resolve it here.
// Unlike tiffin-grab, puchkaman's users table has no `isSystem` row to fall
// back on (confirmed: no such column in db/schema/auth.ts). Rather than guess
// an owner (e.g. "the oldest admin"), which would silently misattribute
// ownership to an arbitrary human in a multi-admin deployment, a missing
// session is a hard error — this path is only ever reachable from a
// script/no-session caller, and none exists yet for createFranchise.
async function resolveActingUserId(): Promise<bigint> {
  const session = await getSession();
  if (!session?.user.id) {
    throw new Error(
      "createFranchise requires either a request session or an explicit acting user id — no session present and no safe default owner exists.",
    );
  }
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, session.user.id)).limit(1);
  if (!row) throw new Error("createFranchise: session user not found.");
  return row.id;
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
): Promise<CreateFranchiseResult> {
  await requireAdmin();
  // Only "all" (brand/super_admin) may mint a new franchise — a franchise-
  // scoped session has no business creating siblings under an arbitrary
  // brandOrganizationId, its own or anyone else's.
  const scopeMode = await resolveOrgScopeMode();
  if (scopeMode.mode !== "all") return { ok: false, error: "Not authorized to create a franchise." };
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

      // clientCode is create-once, derived from the name — not admin input.
      // See organizations.service.ts's deriveUniqueClientCode for why: every
      // FK in this app stores organization.id, but clientCode is still the
      // resolution key for URL segments, the `franchise` cookie, and the
      // Better Auth client-code lookups — a rename would desync all three.
      const clientCode = await deriveUniqueClientCode(tx, name);

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

export async function addMemberAction(
  organizationId: string,
  userPublicId: string,
  role: MemberRole,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  try {
    await assertOrgInScope(organizationId);
    await addMember(organizationId, userPublicId, role);
    revalidatePath(`/dashboard/organization/clients/${organizationId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not add member." };
  }
}

export async function updateOrganizationAction(
  id: string,
  fields: UpdateOrganizationInput,
): Promise<UpdateOrganizationResult> {
  await requireAdmin();
  try {
    await assertOrgInScope(id);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Not authorized." };
  }
  const result = await updateOrganization(id, fields);
  if (result.ok) revalidatePath(`/dashboard/organization/clients/${id}`);
  return result;
}

export async function removeMemberAction(organizationId: string, userPublicId: string): Promise<void> {
  await requireAdmin();
  await assertOrgInScope(organizationId);
  await removeMember(organizationId, userPublicId);
  revalidatePath(`/dashboard/organization/clients/${organizationId}`);
}

export async function searchUsersByEmailAction(query: string): Promise<UserSearchRow[]> {
  await requireAdmin();
  return searchUsersByEmail(query);
}

export async function updateMemberRoleAction(
  organizationId: string,
  userPublicId: string,
  role: MemberRole,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  try {
    await assertOrgInScope(organizationId);
    await updateMemberRole(organizationId, userPublicId, role);
    revalidatePath(`/dashboard/organization/clients/${organizationId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update role." };
  }
}
