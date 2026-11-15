import { Suspense } from "react";
import { RESOURCE_LABELS, orgRoles } from "@/lib/auth/permissions";
import { can, requirePermission } from "@/lib/auth/guards";
import { effectivePermissions, getOrgAccess } from "@/lib/auth/org-access";
import { getRoleChoices } from "@/lib/auth/role-options";
import { getSession } from "@/lib/auth/session";
import { getOrgAccessMatrix } from "@/lib/services/org-access-matrix";
import { getRoleHolderCounts, listCustomRoles } from "@/lib/services/organizations.service";
import { SectionCard } from "@/components/ds";
import { RolesList, RolesListSkeleton } from "./roles-list";

type SearchParams = Promise<{ role?: string }>;

export default function RolesPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense
      fallback={
        <SectionCard title="Roles">
          <RolesListSkeleton />
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
  const canManageMembers = await can({ member: ["update"] });
  const [access, custom, counts, canCreate, canUpdate, canDelete, choices, matrix] = await Promise.all([
    getOrgAccess(),
    organizationId ? listCustomRoles(organizationId) : [],
    organizationId ? getRoleHolderCounts(organizationId) : ({} as Record<string, number>),
    can({ ac: ["create"] }),
    can({ ac: ["update"] }),
    can({ ac: ["delete"] }),
    getRoleChoices(),
    organizationId && canManageMembers ? getOrgAccessMatrix(organizationId) : null,
  ]);
  const roles = [
    ...Object.entries(orgRoles).map(([name, role]) => ({
      name,
      id: null,
      permission: Object.fromEntries(Object.entries(role.statements).map(([k, v]) => [k, [...(v as string[])]])),
      members: counts[name] ?? 0,
    })),
    ...custom.map((r) => ({ name: r.role, id: r.id, permission: r.permission, members: counts[r.role] ?? 0 })),
  ];
  const selected = roles.find((r) => r.name === sp.role)?.name ?? null;
  return (
    <SectionCard
      title="Roles"
      subtitle="What each role can do in this organization. Built-in roles are fixed; create your own for everything in between."
    >
      <RolesList
        resources={RESOURCE_LABELS}
        grantable={effectivePermissions(access)}
        roles={roles}
        selected={selected}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
        people={matrix?.rows.map((r) => ({ id: r.id, name: r.name, email: r.email, roles: r.roles })) ?? null}
        roleOptions={choices.options}
        selfEmail={session?.user.email ?? null}
      />
    </SectionCard>
  );
}
