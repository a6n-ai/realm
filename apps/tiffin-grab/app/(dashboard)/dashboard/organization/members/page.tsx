import { pageOffset } from "@foundry/design-system/filters/parse-filter-state";
import { Suspense } from "react";
import { getSession } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/guards";
import { getRoleChoices, type RoleChoice } from "@/lib/auth/role-options";
import { parseSort } from "@foundry/design-system/list-sort";
import { SectionCard, parseFilterState, type FacetDef } from "@/components/ds";
import { StatCards, StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { InviteUserButton } from "./invite-user-button";
import { memberStats } from "../org-stats";
import { UsersList, UsersListSkeleton } from "./users-list";
import { getMembersForOrgs } from "./members-query";
import { matchesCondition } from "./member-filter";
import type { UserStatusValue } from "./actions";
import { loadMemberPanel } from "./member-panel-data";
import { MemberSheet } from "./member-panel";
import { RESOURCE_LABELS } from "@/lib/auth/permissions";

const USER_STATUSES: UserStatusValue[] = ["active", "inactive", "suspended", "deleted"];

// Server-authored so parseFilterState (server) and ReuiFacetFilters (client)
// stay in lockstep — same pattern as campaigns/logs/contact-lists.
const buildSpec = (roles: RoleChoice[]): FacetDef[] => [
  {
    kind: "multi",
    field: "role",
    label: "Role",
    options: roles.map((r) => ({ value: r.value, label: r.label })),
  },
  {
    kind: "pills",
    field: "status",
    label: "Status",
    options: USER_STATUSES.map((s) => ({ value: s, label: s })),
  },
  {
    kind: "pills",
    field: "password",
    label: "Password",
    options: [{ value: "unset", label: "No password yet" }],
  },
  { kind: "search", fields: ["name", "email", "phone"] },
];

type SearchParams = Promise<Record<string, string | undefined>>;

function MembersCard({ children, inviteRoles = [] }: { children: React.ReactNode; inviteRoles?: RoleChoice[] }) {
  return (
    <SectionCard
      title="Members"
      subtitle="Everyone with access to the console. Open a member to change their roles, status or contact details."
      action={inviteRoles.length ? <InviteUserButton roles={inviteRoles.filter((r) => !r.locked)} /> : undefined}
    >
      {children}
    </SectionCard>
  );
}

export default function UsersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense
      fallback={
        <>
          <StatCardsSkeleton count={5} />
          <MembersCard>
            <UsersListSkeleton />
          </MembersCard>
        </>
      }
    >
      <UsersData searchParams={searchParams} />
    </Suspense>
  );
}

// Small dataset (org-scoped staff count, not customer count) — filter/sort/
// paginate in memory instead of a second SQL query, same precedent as
// clients-list.tsx.
async function UsersData({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission({ member: ["update"] });
  const session = await getSession();
  const sp = await searchParams;

  const sort = parseSort(sp, ["name", "email", "role", "status"], { column: "email", dir: "asc" });
  const SORT_COLUMNS = { name: "name", email: "email", role: "orgRole", status: "status" } as const;

  const { options, canInvite } = await getRoleChoices();
  const spec = buildSpec(options);
  const { condition, page } = parseFilterState(spec, sp);

  // Active org only: Members, Access and Roles never list other clients.
  const activeOrgId = session?.session.activeOrganizationId;
  const allRows = activeOrgId ? await getMembersForOrgs([activeOrgId]) : [];

  const filtered = condition ? allRows.filter((r) => matchesCondition(r, condition)) : allRows;

  const dir = sort.dir === "asc" ? 1 : -1;
  const sortField = SORT_COLUMNS[sort.column];
  filtered.sort((a, b) => String(a[sortField] ?? "").localeCompare(String(b[sortField] ?? "")) * dir);

  const panel = sp.member ? await loadMemberPanel(sp.member) : null;

  const total = filtered.length;
  const rows = filtered.slice(pageOffset(page.page, page.size), pageOffset(page.page, page.size) + page.size);

  return (
    <>
      <StatCards items={memberStats(allRows)} />
      <MembersCard inviteRoles={canInvite ? options : []}>
        <UsersList
          spec={spec}
          rows={rows}
          total={total}
          page={page.page}
          size={page.size}
          sort={sort}
          roleCtx={{ options }}
        />
      </MembersCard>
      {panel && <MemberSheet data={panel} resources={RESOURCE_LABELS} />}
    </>
  );
}
