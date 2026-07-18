import { Suspense } from "react";
import { asc, desc } from "drizzle-orm";
import { UsersIcon } from "lucide-react";
import { db } from "@/db/client";
import { featureFlags, userFeatureFlags, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { parseSort } from "@/lib/list/sort";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { UsersList, UsersListSkeleton } from "./users-list";

type SearchParams = Promise<{ sort?: string; dir?: string }>;

export default function UsersPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <PageHeader icon={UsersIcon} title="Users" />
      <SectionCard title="All users">
        <Suspense fallback={<UsersListSkeleton />}>
          <UsersData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function UsersData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sort = parseSort(await searchParams, ["email", "role"], {
    column: "email",
    dir: "asc",
  });
  const sortCol = sort.column === "role" ? users.role : users.email;
  const orderBy = sort.dir === "asc" ? asc(sortCol) : desc(sortCol);

  const [allUsers, allFlags, allOverrides] = await Promise.all([
    db.select().from(users).orderBy(orderBy),
    db.select().from(featureFlags),
    db.select().from(userFeatureFlags),
  ]);

  const overridesByUser = new Map<bigint, Map<bigint, boolean>>();
  for (const o of allOverrides) {
    let m = overridesByUser.get(o.userId);
    if (!m) overridesByUser.set(o.userId, (m = new Map()));
    m.set(o.flagId, Boolean(o.enabled));
  }

  const rows = allUsers.map((u) => {
    const ov = overridesByUser.get(u.id);
    return {
      id: u.publicId,
      email: u.email,
      phone: u.phone,
      role: u.role,
      status: u.status,
      flags: allFlags.map((f) => ({
        id: f.publicId,
        key: f.key,
        label: f.label,
        enabled: ov?.has(f.id) ? (ov.get(f.id) as boolean) : f.defaultEnabled,
      })),
    };
  });

  return <UsersList rows={rows} sort={sort} />;
}
