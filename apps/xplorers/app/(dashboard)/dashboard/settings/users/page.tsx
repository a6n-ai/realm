import { Suspense } from "react";
import { and, inList } from "@foundry/commons/model/condition";
import { PageHeader, PageShell, SectionCard, parseFilterState, type FacetDef } from "@foundry/design-system";
import { UsersIcon } from "lucide-react";
import { INVITABLE_ROLES } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { parseSort } from "@/lib/list/sort";
import { usersService, type UserSortColumn } from "@/lib/services/users.service";
import { InviteUserButton } from "./invite-user-button";
import { UsersTable, UsersTableSkeleton } from "./users-table";

type SearchParams = Promise<Record<string, string | undefined>>;

const STAFF_ROLES = ["admin", "member"] as const;

const SPEC: FacetDef[] = [{ kind: "search", fields: ["name", "email"] }];

const USER_SORT_COLUMNS = ["name", "email", "role", "status"] as const satisfies readonly UserSortColumn[];

export default function UsersSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <PageHeader
        icon={UsersIcon}
        title="Users"
        subtitle="Staff accounts. Families sign in at /me and stay off this list unless you search for the user role."
        actions={<InviteUserButton roles={INVITABLE_ROLES.map((r) => ({ value: r, label: r }))} />}
      />
      <SectionCard title="All accounts">
        <Suspense fallback={<UsersTableSkeleton />}>
          <UsersData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function UsersData({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission({ user: ["list"] });
  const session = await getSession();
  const selfPublicId = session?.user?.id;

  const sp = await searchParams;
  const sort = parseSort(sp, USER_SORT_COLUMNS, { column: "name", dir: "asc" });
  const { condition, page } = parseFilterState(SPEC, sp);

  const effectiveCondition = sp.role
    ? condition
    : condition
      ? and(condition, inList("role", [...STAFF_ROLES]))
      : inList("role", [...STAFF_ROLES]);

  const result = await usersService.queryUsers(effectiveCondition, page, sort);

  return (
    <UsersTable
      rows={result.items}
      total={result.total}
      page={page.page}
      size={page.size}
      sort={sort}
      selfPublicId={selfPublicId}
    />
  );
}
