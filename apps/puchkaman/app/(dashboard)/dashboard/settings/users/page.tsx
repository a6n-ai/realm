import { UsersIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@realm/design-system";
import { Badge } from "@realm/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@realm/ui/table";
import { INVITABLE_ROLES } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { usersService } from "@/lib/services/users.service";
import { InviteUserButton } from "./invite-user-button";
import { RoleSelect, StatusActions } from "./user-row";

export const dynamic = "force-dynamic";

export default async function UsersSettingsPage() {
  await requirePermission({ user: ["list"] });
  const [rows, session] = await Promise.all([usersService.listAll(), getSession()]);
  const selfPublicId = session?.user?.id;

  return (
    <PageShell>
      <PageHeader
        icon={UsersIcon}
        title="Users"
        subtitle="Accounts that can sign in to this dashboard. Clover Register staff are managed separately under Employees."
        actions={
          <InviteUserButton
            roles={INVITABLE_ROLES.map((r) => ({ value: r, label: r === "admin" ? "Admin" : "Member" }))}
          />
        }
      />
      <SectionCard title="All accounts">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.publicId}>
                <TableCell className="font-medium">{r.name ?? "—"}</TableCell>
                <TableCell>{r.email ?? "—"}</TableCell>
                <TableCell>
                  <RoleSelect
                    publicId={r.publicId}
                    role={r.role}
                    status={r.status}
                    isSelf={r.publicId === selfPublicId}
                  />
                </TableCell>
                <TableCell>
                  <Badge variant={r.status === "active" ? "default" : "outline"}>
                    {r.status === "active"
                      ? "Active"
                      : r.status === "suspended"
                        ? "Suspended"
                        : r.status === "deleted"
                          ? "Removed"
                          : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <StatusActions
                    publicId={r.publicId}
                    email={r.email}
                    status={r.status}
                    isSelf={r.publicId === selfPublicId}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionCard>
    </PageShell>
  );
}
