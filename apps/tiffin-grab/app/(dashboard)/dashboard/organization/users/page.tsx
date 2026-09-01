import { Suspense } from "react";
import { asc, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { INVITABLE_ROLES } from "@/lib/auth/permissions";
import { parseSort } from "@/lib/list/sort";
import { SectionCard } from "@/components/ds";
import { InviteUserButton } from "./invite-user-button";
import { UsersList, UsersListSkeleton } from "./users-list";

type SearchParams = Promise<{ sort?: string; dir?: string }>;

export default function UsersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <SectionCard
      title="All users"
      action={
        <InviteUserButton
          roles={INVITABLE_ROLES.map((r) => ({ value: r, label: r === "admin" ? "Admin" : "Member" }))}
        />
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
  const sort = parseSort(await searchParams, ["name", "email", "role", "status"], {
    column: "email",
    dir: "asc",
  });
  const SORT_COLUMNS = { name: users.name, email: users.email, role: users.role, status: users.status } as const;
  const orderBy = sort.dir === "asc" ? asc(SORT_COLUMNS[sort.column]) : desc(SORT_COLUMNS[sort.column]);

  const allUsers = await db.select().from(users).orderBy(orderBy);

  const rows = allUsers.map((u) => ({
    id: u.publicId,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    status: u.status,
    passwordSet: u.passwordSet,
  }));

  return <UsersList rows={rows} sort={sort} />;
}
