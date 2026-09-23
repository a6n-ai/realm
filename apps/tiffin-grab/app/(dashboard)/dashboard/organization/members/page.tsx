import { Suspense } from "react";
import type { Condition } from "@foundry/commons/model/condition";
import { requireAdmin } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { resolveMemberVisibleOrgIds, listOrganizations } from "@/lib/services/organizations.service";
import { INVITABLE_ROLES } from "@/lib/auth/permissions";
import { parseSort } from "@/lib/list/sort";
import { SectionCard, parseFilterState, type FacetDef } from "@/components/ds";
import { InviteUserButton } from "./invite-user-button";
import { UsersList, UsersListSkeleton } from "./users-list";
import { getMembersForOrgs, type MemberRow } from "./members-query";
import type { UserStatusValue } from "./actions";

const USER_STATUSES: UserStatusValue[] = ["active", "inactive", "suspended", "deleted"];

// Server-authored so parseFilterState (server) and ReuiFacetFilters (client)
// stay in lockstep — same pattern as campaigns/logs/contact-lists.
const SPEC: FacetDef[] = [
  {
    kind: "multi",
    field: "role",
    label: "Role",
    options: [...INVITABLE_ROLES.map((r) => ({ value: r as string, label: r })), { value: "user", label: "user" }],
  },
  {
    kind: "pills",
    field: "status",
    label: "Status",
    options: USER_STATUSES.map((s) => ({ value: s, label: s })),
  },
  { kind: "search", fields: ["name", "email", "phone"] },
];

type SearchParams = Promise<Record<string, string | undefined>>;

export default function UsersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <SectionCard
      title="All users"
      action={
        <InviteUserButton roles={INVITABLE_ROLES.map((r) => ({ value: r, label: r }))} />
      }
    >
      <Suspense fallback={<UsersListSkeleton />}>
        <UsersData searchParams={searchParams} />
      </Suspense>
    </SectionCard>
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
  const value = row[condition.field as keyof MemberRow];
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
  await requireAdmin();
  const session = await getSession();
  const sp = await searchParams;

  const sort = parseSort(sp, ["name", "email", "role", "status"], { column: "email", dir: "asc" });
  const SORT_COLUMNS = { name: "name", email: "email", role: "role", status: "status" } as const;

  const { condition, page } = parseFilterState(SPEC, sp);

  const visibleOrgIds = await resolveMemberVisibleOrgIds(session);
  const orgIds = visibleOrgIds === "all" ? (await listOrganizations()).map((o) => o.id) : visibleOrgIds;
  const allRows = await getMembersForOrgs(orgIds);

  const filtered = condition ? allRows.filter((r) => matchesCondition(r, condition)) : allRows;

  const dir = sort.dir === "asc" ? 1 : -1;
  const sortField = SORT_COLUMNS[sort.column];
  filtered.sort((a, b) => String(a[sortField] ?? "").localeCompare(String(b[sortField] ?? "")) * dir);

  const total = filtered.length;
  const rows = filtered.slice(page.page * page.size, page.page * page.size + page.size);

  return <UsersList spec={SPEC} rows={rows} total={total} page={page.page} size={page.size} sort={sort} />;
}
