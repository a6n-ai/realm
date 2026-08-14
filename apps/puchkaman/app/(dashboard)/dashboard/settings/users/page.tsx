import { Suspense } from "react";
import { UsersIcon } from "lucide-react";
import { and, inList } from "@realm/commons/model/condition";
import { getCloverConnection } from "@realm/clover";
import { PageHeader, PageShell, SectionCard, parseFilterState, type FacetDef } from "@realm/design-system";
import { INVITABLE_ROLES } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { parseSort } from "@/lib/list/sort";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { usersService, type UserSortColumn } from "@/lib/services/users.service";
import { InviteUserButton } from "./invite-user-button";
import { SyncCloverUsersButton } from "./sync-clover-users-button";
import { UsersTable, UsersTableSkeleton } from "./users-table";

export const dynamic = "force-dynamic";

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
      <PageHeader
        icon={UsersIcon}
        title="Users"
        subtitle="Accounts that can sign in to this dashboard. Clover Register staff are managed separately under Employees."
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
