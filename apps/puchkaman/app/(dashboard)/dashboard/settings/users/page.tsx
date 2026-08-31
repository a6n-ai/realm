import { Suspense } from "react";
import { and, inList } from "@foundry/commons/model/condition";
import { getCloverConnection } from "@foundry/clover";
import { PageShell, SectionCard, parseFilterState, type FacetDef } from "@foundry/design-system";
import { INVITABLE_ROLES } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { parseSort } from "@/lib/list/sort";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { usersService, type UserSortColumn } from "@/lib/services/users.service";
import { OrganizationHeader, OrganizationTabs } from "../../organization/organization-tabs";
import { InviteUserButton } from "./invite-user-button";
import { SyncCloverUsersButton } from "./sync-clover-users-button";
import { UsersTable, UsersTableSkeleton } from "./users-table";

type SearchParams = Promise<Record<string, string | undefined>>;

// Every guest customer checkout mints a `users` row too (see auth.ts), so an
// unfiltered list drowns staff in customers. Staff-only by default; the "role"
// facet's own options (admin/member/user) are how a customer explicitly widens it.
const STAFF_ROLES = ["admin", "member"] as const;

// Facet spec — server-authored so parseFilterState (server) and ReuiFacetFilters
// (client) stay in lockstep. Fields match the users schema's camelCase property
// names (see db/schema/auth.ts) since the service resolves them straight off it.
export const SPEC: FacetDef[] = [
  {
    kind: "multi",
    field: "role",
    label: "Role",
    options: [
      { value: "admin", label: "Admin" },
      { value: "member", label: "Member" },
      { value: "user", label: "Customer" },
    ],
  },
  {
    kind: "pills",
    field: "status",
    label: "Status",
    options: [
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
      { value: "suspended", label: "Suspended" },
      { value: "deleted", label: "Deleted" },
    ],
  },
  { kind: "search", fields: ["name", "email"] },
];

const USER_SORT_COLUMNS = ["name", "email", "role", "status"] as const satisfies readonly UserSortColumn[];

export default function UsersSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      {/* This page is reached from the Organization > Users tab (see
          organization-tabs.tsx) but lives outside organization/layout.tsx's
          route tree, so that layout's header + tab bar don't carry over here —
          render the same shared pieces, same order, explicitly. */}
      <OrganizationHeader
        actions={
          <>
            <InviteUserButton
              roles={INVITABLE_ROLES.map((r) => ({ value: r, label: r === "admin" ? "Admin" : "Member" }))}
            />
            <Suspense fallback={null}>
              <SyncCloverUsersSlot />
            </Suspense>
          </>
        }
      />
      <OrganizationTabs />
      <SectionCard title="All accounts">
        <Suspense fallback={<UsersTableSkeleton />}>
          <UsersData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function SyncCloverUsersSlot() {
  const clover = await getCloverConnection(integrationsConfigStore);
  return <SyncCloverUsersButton cloverConnected={Boolean(clover.connected && clover.merchantId)} />;
}

async function UsersData({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission({ user: ["list"] });
  const session = await getSession();
  const selfPublicId = session?.user?.id;

  const sp = await searchParams;
  const sort = parseSort(sp, USER_SORT_COLUMNS, { column: "name", dir: "asc" });
  const { condition, page } = parseFilterState(SPEC, sp);

  // sp.role absent → the role facet was never touched, so apply the staff
  // default ourselves. The moment a customer picks anything in that facet
  // (including "Customer"), sp.role is set and this default steps aside.
  const effectiveCondition = sp.role
    ? condition
    : condition
      ? and(condition, inList("role", [...STAFF_ROLES]))
      : inList("role", [...STAFF_ROLES]);

  const result = await usersService.queryUsers(effectiveCondition, page, sort);

  return (
    <UsersTable
      spec={SPEC}
      rows={result.items}
      total={result.total}
      page={page.page}
      size={page.size}
      sort={sort}
      selfPublicId={selfPublicId}
    />
  );
}
