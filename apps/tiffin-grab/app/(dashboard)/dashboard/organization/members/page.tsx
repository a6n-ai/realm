import { pageOffset } from "@foundry/design-system/filters/parse-filter-state";
import { Suspense } from "react";
import type { Condition } from "@foundry/commons/model/condition";
import { getSession } from "@/lib/auth/session";
import { listOrganizations } from "@/lib/services/organizations.service";
import { resolveSessionVisibleOrgIds } from "@/lib/auth/visible-orgs";
import { getRoleChoices, type RoleChoice } from "@/lib/auth/role-options";
import { parseSort } from "@foundry/design-system/list-sort";
import { SectionCard, parseFilterState, type FacetDef } from "@/components/ds";
import { StatCards, StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { InviteUserButton } from "./invite-user-button";
import { memberStats } from "../org-stats";
import { UsersList, UsersListSkeleton } from "./users-list";
import { getMembersForOrgs, type MemberRow } from "./members-query";
import type { UserStatusValue } from "./actions";

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
      subtitle="Everyone with access to the console. Change a role or status inline, or open a member for details."
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
function matchesCondition(row: MemberRow, condition: Condition): boolean {
  if (condition.type === "complex") {
    return condition.operator === "and"
      ? condition.conditions.every((c) => matchesCondition(row, c))
      : condition.conditions.some((c) => matchesCondition(row, c));
  }
  if (condition.field === "password") return condition.value === "unset" ? !row.passwordSet : row.passwordSet;
  const value = condition.field === "role" ? row.orgRole : row[condition.field as keyof MemberRow];
  switch (condition.operator) {
    case "eq":
      return value === condition.value;
    case "in":
      return (condition.value as unknown[]).includes(value);
    case "like": {
      const needle = String(condition.value).replace(/%/g, "").toLowerCase();
      return String(value ?? "").toLowerCase().includes(needle);
    }
    default:
      return true;
  }
}

async function UsersData({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSession();
  const sp = await searchParams;

  const sort = parseSort(sp, ["name", "email", "role", "status"], { column: "email", dir: "asc" });
  const SORT_COLUMNS = { name: "name", email: "email", role: "orgRole", status: "status" } as const;

  const { organizationId: activeOrgId, options, canGrantOwner, canInvite } = await getRoleChoices();
  const spec = buildSpec(options);
  const { condition, page } = parseFilterState(spec, sp);

  const visibleOrgIds = await resolveSessionVisibleOrgIds(session);
  const orgIds = visibleOrgIds === "all" ? (await listOrganizations()).map((o) => o.id) : visibleOrgIds;
  const allRows = await getMembersForOrgs(orgIds);

  const filtered = condition ? allRows.filter((r) => matchesCondition(r, condition)) : allRows;

  const dir = sort.dir === "asc" ? 1 : -1;
  const sortField = SORT_COLUMNS[sort.column];
  filtered.sort((a, b) => String(a[sortField] ?? "").localeCompare(String(b[sortField] ?? "")) * dir);

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
          roleCtx={{ activeOrgId, options, canGrantOwner }}
        />
      </MembersCard>
    </>
  );
}
