import { asc, desc } from "drizzle-orm";
import { UsersIcon } from "lucide-react";
import { db } from "@/db/client";
import { featureFlags, users } from "@/db/schema";
import { getEffectiveFlags } from "@/lib/flags";
import { parseSort } from "@/lib/list/sort";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, PageShell, SectionCard, SortableHeader } from "@/components/ds";
import { UserRow } from "./user-row";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; dir?: string }>;
}) {
  const sort = parseSort(await searchParams, ["email", "role"], {
    column: "email",
    dir: "asc",
  });
  const sortCol = sort.column === "role" ? users.role : users.email;
  const orderBy = sort.dir === "asc" ? asc(sortCol) : desc(sortCol);

  const [allUsers, allFlags] = await Promise.all([
    db.select().from(users).orderBy(orderBy),
    db.select().from(featureFlags),
  ]);

  const rows = await Promise.all(
    allUsers.map(async (u) => {
      const effective = await getEffectiveFlags(u.publicId);
      return {
        user: {
          id: u.publicId,
          email: u.email,
          phone: u.phone,
          role: u.role,
        },
        flags: allFlags.map((f) => ({ id: f.publicId, key: f.key, label: f.label, enabled: effective[f.key] ?? false })),
      };
    }),
  );

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
