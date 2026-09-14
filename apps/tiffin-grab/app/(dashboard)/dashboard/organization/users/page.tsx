import { Suspense } from "react";
import { asc, desc, count } from "drizzle-orm";
import { columnResolver, conditionToSql } from "@foundry/database";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { INVITABLE_ROLES } from "@/lib/auth/permissions";
import { parseSort } from "@/lib/list/sort";
import { SectionCard, parseFilterState, type FacetDef } from "@/components/ds";
import { InviteUserButton } from "./invite-user-button";
import { UsersList, UsersListSkeleton } from "./users-list";
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

async function UsersData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;

  const sort = parseSort(sp, ["name", "email", "role", "status"], { column: "email", dir: "asc" });
  const SORT_COLUMNS = { name: users.name, email: users.email, role: users.role, status: users.status } as const;
  const orderBy = sort.dir === "asc" ? asc(SORT_COLUMNS[sort.column]) : desc(SORT_COLUMNS[sort.column]);

  const { condition, page } = parseFilterState(SPEC, sp);
  const where = conditionToSql(
    condition,
    columnResolver({ role: users.role, status: users.status, name: users.name, email: users.email, phone: users.phone }),
  );

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: users.publicId,
        name: users.name,
        email: users.email,
        phone: users.phone,
        role: users.role,
        status: users.status,
        passwordSet: users.passwordSet,
      })
      .from(users)
      .where(where)
      .orderBy(orderBy)
      .limit(page.size)
      .offset(page.page * page.size),
    db.select({ n: count() }).from(users).where(where),
  ]);

  return <UsersList spec={SPEC} rows={rows} total={Number(totalRow?.n ?? 0)} page={page.page} size={page.size} sort={sort} />;
}
