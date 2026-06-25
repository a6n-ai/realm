import { UsersIcon } from "lucide-react";
import { db } from "@/db/client";
import { featureFlags, users } from "@/db/schema";
import { getEffectiveFlags } from "@/lib/flags";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { UserRow } from "./user-row";

export default async function UsersPage() {
  const [allUsers, allFlags] = await Promise.all([
    db.select().from(users),
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
              <TableHead>Contact</TableHead>
              <TableHead>Role</TableHead>
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
