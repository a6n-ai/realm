import { Suspense } from "react";
import { RESOURCE_LABELS, orgRoles } from "@/lib/auth/permissions";
import { can, requirePermission } from "@/lib/auth/guards";
import { effectivePermissions, getOrgAccess } from "@/lib/auth/org-access";
import { getSession } from "@/lib/auth/session";
import { getRoleHolderCounts, listCustomRoles } from "@/lib/services/organizations.service";
import { getMembersForOrgs } from "../members/members-query";
import { SectionCard } from "@/components/ds";
import { RoleEditor } from "./role-editor";
import { RolesTable, RolesTableSkeleton } from "./roles-table";
import type { RoleItem } from "./role-summary";

type SearchParams = Promise<{ role?: string }>;

export default function RolesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense
      fallback={
        <SectionCard title="Roles">
          <RolesTableSkeleton />
        </SectionCard>
      }
    >
      <RolesData searchParams={searchParams} />
    </Suspense>
  );
}

// An unreadable list throws to organization/error.tsx, which shows the inline error with Retry.
async function RolesData({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission({ ac: ["read"] });
  const sp = await searchParams;
  const session = await getSession();
  const organizationId = session?.session.activeOrganizationId;
  const [access, custom, counts, canCreate, canUpdate, canDelete, canManageMembers] = await Promise.all([
    getOrgAccess(),
    organizationId ? listCustomRoles(organizationId) : [],
    organizationId ? getRoleHolderCounts(organizationId) : ({} as Record<string, number>),
    can({ ac: ["create"] }),
    can({ ac: ["update"] }),
    can({ ac: ["delete"] }),
    can({ member: ["update"] }),
  ]);
  // Holders and candidates for the editor's member list. Needs member:update, not just ac:read.
  const members =
    organizationId && canManageMembers
      ? (await getMembersForOrgs([organizationId])).map((m) => ({ memberId: m.memberId, name: m.name, email: m.email, orgRole: m.orgRole }))
      : null;
  const roles: RoleItem[] = [
    ...Object.entries(orgRoles).map(([name, role]) => ({
      name,
      id: null,
      permission: Object.fromEntries(Object.entries(role.statements).map(([k, v]) => [k, [...(v as string[])]])),
      members: counts[name] ?? 0,
    })),
    ...custom.map((r) => ({ name: r.role, id: r.id, permission: r.permission, members: counts[r.role] ?? 0 })),
  ];
  const grantable = effectivePermissions(access);
  const current = roles.find((r) => r.name === sp.role);

  if (current) {
    return (
      <RoleEditor
        // Re-seeds the draft when the server set changes (save, refresh).
        key={`${current.name}:${JSON.stringify(current.permission)}`}
        role={current}
        resources={RESOURCE_LABELS}
        grantable={grantable}
        canUpdate={canUpdate}
        canDelete={canDelete}
        members={members}
      />
    );
  }

  return (
    <SectionCard
      title="Roles"
      subtitle="What each role can do in this organization. Built-in roles are fixed; create your own for everything in between."
    >
      <RolesTable roles={roles} resources={RESOURCE_LABELS} grantable={grantable} canCreate={canCreate} />
    </SectionCard>
  );
}
