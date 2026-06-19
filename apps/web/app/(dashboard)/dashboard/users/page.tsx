import { db } from "@/db/client";
import { featureFlags, users } from "@/db/schema";
import { getEffectiveFlags } from "@/lib/flags";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserRow } from "./user-row";

export default async function UsersPage() {
  const [allUsers, allFlags] = await Promise.all([
    db.select().from(users),
    db.select().from(featureFlags),
  ]);

  const rows = await Promise.all(
    allUsers.map(async (u) => {
      const effective = await getEffectiveFlags(u.id);
      return {
        user: { id: u.id, email: u.email, phone: u.phone, role: u.role },
        flags: allFlags.map((f) => ({ id: f.id, key: f.key, label: f.label, enabled: effective[f.key] ?? false })),
      };
    }),
  );

  return (
    <section>
      <h1 className="mb-4 text-2xl font-semibold">Users</h1>
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
    </section>
  );
}
