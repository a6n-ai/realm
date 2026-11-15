"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LockIcon, ShieldCheckIcon } from "lucide-react";
import type { PermissionMap, ResourceLabel } from "@foundry/crm";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { TableCell } from "@foundry/ui/table";
import { AreaBadge, DataTable, type Column } from "@/components/ds";
import { Badge } from "@/components/reui/badge";
import { NewRoleDialog } from "./role-dialogs";
import { areasOf, countPermissions, memberCount, type RoleItem } from "./role-summary";

const ROLES = "/dashboard/organization/roles";
const roleHref = (name: string) => `${ROLES}?role=${encodeURIComponent(name)}`;

const COLUMNS: readonly Column<"role" | "permissions" | "areas" | "members">[] = [
  { key: "role", label: "Role" },
  { key: "permissions", label: "Permissions" },
  { key: "areas", label: "Areas" },
  { key: "members", label: "Members" },
];

export function RolesTable({
  roles,
  resources,
  grantable,
  canCreate,
}: {
  roles: RoleItem[];
  resources: ResourceLabel[];
  grantable: PermissionMap;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [area, setArea] = useState("all");
  const rows = roles.filter((r) => area === "all" || areasOf(r.permission, resources).some((a) => a.resource === area));

  const create = (
    <NewRoleDialog resources={resources} grantable={grantable} onCreated={(name) => router.push(roleHref(name))} />
  );

  return (
    <DataTable
      serial={false}
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => r.name}
      search={{ keys: ["name"], placeholder: "Search roles…" }}
      filters={
        <Select value={area} onValueChange={setArea}>
          <SelectTrigger aria-label="Filter by area" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All areas</SelectItem>
            {resources.map((r) => (
              <SelectItem key={r.resource} value={r.resource}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      actions={canCreate ? create : undefined}
      onRowClick={(r) => router.push(roleHref(r.name))}
      renderRow={(r) => {
        const areas = areasOf(r.permission, resources);
        return (
          <>
            <TableCell className="font-medium capitalize">
              <span className="flex items-center gap-2">
                {r.name}
                {r.id === null && (
                  <Badge variant="secondary">
                    <LockIcon /> Built-in
                  </Badge>
                )}
              </span>
            </TableCell>
            <TableCell className="tabular-nums">{countPermissions(r.permission)}</TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {areas.map((a) => (
                  <AreaBadge key={a.resource} resource={a.resource} label={a.label} />
                ))}
              </div>
            </TableCell>
            <TableCell className="tabular-nums">{memberCount(r.members)}</TableCell>
          </>
        );
      }}
      mobileCard={(r) => (
        <Link
          href={roleHref(r.name)}
          className="flex flex-col gap-2 rounded-lg border p-3 transition-colors hover:bg-muted"
        >
          <span className="flex items-center gap-2 text-sm font-medium capitalize">
            {r.name}
            {r.id === null && <LockIcon aria-label="Built-in" className="size-4 text-muted-foreground" />}
          </span>
          <span className="text-xs text-muted-foreground">
            {countPermissions(r.permission)} permissions · {memberCount(r.members)}
          </span>
        </Link>
      )}
      emptyIcon={ShieldCheckIcon}
      emptyMessage="No roles yet."
      emptySearchMessage="No roles match your filters."
      emptyAction={canCreate ? create : undefined}
    />
  );
}

export function RolesTableSkeleton() {
  return <DataTable.Skeleton columns={COLUMNS} />;
}
