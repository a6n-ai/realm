import { Suspense } from "react";
import { RESOURCE_LABELS, orgRoles } from "@/lib/auth/permissions";
import { can, requirePermission } from "@/lib/auth/guards";
import { effectivePermissions, getOrgAccess } from "@/lib/auth/org-access";
import { getSession } from "@/lib/auth/session";
import { getRoleHolderCounts, listCustomRoles } from "@/lib/services/organizations.service";
import { SectionCard } from "@/components/ds";
import { RolesList, RolesListSkeleton } from "./roles-list";

export default function RolesPage() {
  return (
    <Suspense
      fallback={
        <SectionCard title="Roles">
          <RolesListSkeleton />
        </SectionCard>
      }
    >
      <RolesData />
    </Suspense>
  );
}

// An unreadable list throws to organization/error.tsx, which shows the inline error with Retry.
async function RolesData() {
  await requirePermission({ ac: ["read"] });
  const session = await getSession();
  const organizationId = session?.session.activeOrganizationId;
  const [access, custom, counts, canCreate, canUpdate, canDelete] = await Promise.all([
    getOrgAccess(),
    organizationId ? listCustomRoles(organizationId) : [],
    organizationId ? getRoleHolderCounts(organizationId) : ({} as Record<string, number>),
    can({ ac: ["create"] }),
    can({ ac: ["update"] }),
    can({ ac: ["delete"] }),
  ]);
  const builtIn = Object.entries(orgRoles).map(([name, role]) => ({
    name,
    permission: Object.fromEntries(Object.entries(role.statements).map(([k, v]) => [k, [...(v as string[])]])),
    members: counts[name] ?? 0,
  }));
  return (
    <SectionCard
      title="Roles"
      subtitle="What each role can do in this organization. Built-in roles are fixed; create your own for everything in between."
    >
      <RolesList
        resources={RESOURCE_LABELS}
        grantable={effectivePermissions(access)}
        builtIn={builtIn}
        custom={custom.map((r) => ({ id: r.id, name: r.role, permission: r.permission, members: counts[r.role] ?? 0 }))}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
      />
    </SectionCard>
  );
}
