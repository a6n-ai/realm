import { asc, desc } from "drizzle-orm";
import { UsersIcon } from "lucide-react";
import { db } from "@/db/client";
import { featureFlags, userFeatureFlags, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { parseSort } from "@/lib/list/sort";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, PageShell, SectionCard, SortableHeader } from "@/components/ds";
import { UserRow } from "./user-row";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
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
      user: {
        id: u.publicId,
        email: u.email,
        phone: u.phone,
        role: u.role,
      },
      flags: allFlags.map((f) => ({
        id: f.publicId,
        key: f.key,
        label: f.label,
        enabled: ov?.has(f.id) ? (ov.get(f.id) as boolean) : f.defaultEnabled,
      })),
    };
  });

  return (
    <PageShell>
      <PageHeader icon={UsersIcon} title="Users" />
      <SectionCard title="All users">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader column="email" label="Contact" currentSort={sort.column} currentDir={sort.dir} />
              <SortableHeader column="role" label="Role" currentSort={sort.column} currentDir={sort.dir} />
              <TableHead>Feature flags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <UserRow key={r.user.id} user={r.user} flags={r.flags} />
            ))}
          </TableBody>
        </Table>
      </SectionCard>
    </PageShell>
  );
}
