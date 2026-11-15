"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { assertHierarchyDepth } from "@foundry/auth";
import { db } from "@/db/client";
import { member, organization } from "@/db/schema";
import { systemUserId, userIdByPublicId } from "@/lib/identity/user-ids";
import { requireCanAssignRole, requireOwnerToGrant, requirePermission, requirePermissionIn } from "@/lib/auth/guards";
import { getRoleOptions } from "@/lib/auth/role-options";
import { getSession } from "@/lib/auth/session";
import { recordAudit } from "@/lib/identity/audit";
import {
  addMember,
  countOwners,
  removeMember,
  searchUsersByEmail,
  updateOrganization,
  type MemberRole,
  type UpdateOrganizationInput,
  type UpdateOrganizationResult,
  type UserSearchRow,
} from "./organizations.service";
import { evictPublicPages } from "@/lib/landing/public-cache";

// The target member's current role, so removing or demoting an owner needs owner too.
async function currentMemberRole(organizationId: string, userPublicId: string): Promise<string | null> {
  const userId = await userIdByPublicId(userPublicId);
  if (!userId) return null;
  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)));
  return row?.role ?? null;
}

export type CreateFranchiseResult = { ok: true; id: string } | { ok: false; error: string };

// Better-auth's internal user id is the stringified users.id bigint, never the
// publicId getSession() exposes (see lib/auth/session.ts) — resolve it here.
// Falls back to the seeded system user (same pattern as inquiries.service.ts's
// sys-user lookup) when there's no request-scoped session, e.g. a script or test.
async function resolveActingUserId(): Promise<bigint | null> {
  const session = await getSession();
  if (session?.user.id) {
    const id = await userIdByPublicId(session.user.id);
    if (id) return id;
  }
  return systemUserId();
}

// Does not call `auth.api.createOrganization`.
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
//      change to the shared auth config.
//
// So we do what seed-brand-org.ts already does for the brand org: write the
// organization + owner member rows directly, after re-running the same depth guard
// the (unreachable) plugin hook was meant to enforce.
export async function createFranchise(
  brandOrganizationId: string,
  name: string,
  clientCode: string,
): Promise<CreateFranchiseResult> {
  await requirePermissionIn(brandOrganizationId, { organization: ["update"] });
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

    revalidatePath("/dashboard/organization/settings");
    await evictPublicPages();
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
  await requirePermissionIn(organizationId, { member: ["update"] });
  // `role` is only typed: a server action receives whatever the client sends.
  if (!(await getRoleOptions(organizationId)).some((o) => o.value === role)) {
    return { ok: false, error: "Unknown role." };
  }
  await requireOwnerToGrant(organizationId, role);
  await requireCanAssignRole(organizationId, role);
  try {
    await addMember(organizationId, userPublicId, role);
    revalidatePath(`/dashboard/organization/settings/${organizationId}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not add member." };
  }
}

export async function updateOrganizationAction(
  id: string,
  fields: UpdateOrganizationInput,
): Promise<UpdateOrganizationResult> {
  await requirePermissionIn(id, { organization: ["update"] });
  const result = await updateOrganization(id, fields);
  if (result.ok) {
    revalidatePath(`/dashboard/organization/settings/${id}`);
    await evictPublicPages();
  }
  return result;
}

export async function removeMemberAction(
  organizationId: string,
  userPublicId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePermissionIn(organizationId, { member: ["update"] });
  const session = await getSession();
  if (session?.user.id === userPublicId) return { ok: false, error: "You can't remove yourself from the organization." };
  const current = await currentMemberRole(organizationId, userPublicId);
  await requireOwnerToGrant(organizationId, current);
  // Removing someone who holds more than you is as much an escalation as granting it.
  if (current) await requireCanAssignRole(organizationId, current);
  const wasOwner = current?.split(",").some((r) => r.trim() === "owner") ?? false;
  if (wasOwner && (await countOwners(organizationId)) <= 1) {
    return { ok: false, error: "An organization needs at least one owner" };
  }
  await removeMember(organizationId, userPublicId);
  await recordAudit({
    entity: "member",
    entityPublicId: userPublicId,
    operation: "delete",
    changes: { organizationId, role: current },
    createdBy: session ? await userIdByPublicId(session.user.id) : null,
  });
  revalidatePath(`/dashboard/organization/settings/${organizationId}`);
  return { ok: true };
}

export async function searchUsersByEmailAction(query: string): Promise<UserSearchRow[]> {
  await requirePermission({ member: ["update"] });
  return searchUsersByEmail(query);
}
