import { UsersIcon } from "lucide-react";
import { db } from "@/db/client";
import { featureFlags, users } from "@/db/schema";
import { getEffectiveFlags } from "@/lib/flags";
import { Card, CardContent } from "@/components/ui/card";
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
    <section className="space-y-6">
      <div className="group flex items-center gap-3">
        <span className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-lg">
          <UsersIcon className="icon-pop size-5" />
        </span>
        <h1 className="gradient-text text-2xl font-semibold">Users</h1>
      </div>
      <Card className="card-glow overflow-hidden p-0">
        <CardContent className="p-0">
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
        </CardContent>
      </Card>
    </section>
  );
}
