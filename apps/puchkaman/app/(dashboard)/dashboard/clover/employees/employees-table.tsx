"use client";

import { UsersIcon } from "lucide-react";
import { DataTable, type Column } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { TableCell } from "@foundry/ui/table";
import { SyncOneEmployeeButton } from "@/components/admin/sync-one-employee-button";
import type { EmployeeRow } from "@/lib/services/employees.repository";

export const EMPLOYEE_COLUMNS: readonly Column<
  "name" | "nickname" | "email" | "role" | "status" | "cloverId" | "actions"
>[] = [
  { key: "name", label: "Name" },
  { key: "nickname", label: "Nickname" },
  { key: "email", label: "Email" },
  { key: "role", label: "Role" },
  { key: "status", label: "Status" },
  { key: "cloverId", label: "Clover id" },
  { key: "actions", label: "" },
];

export function EmployeesTable({ rows }: { rows: EmployeeRow[] }) {
  return (
    <DataTable
      columns={EMPLOYEE_COLUMNS}
      rows={rows}
      rowKey={(r) => r.publicId}
      serial={false}
      search={{
        keys: ["name", "nickname", "email"],
        placeholder: "Search name, nickname or email…",
        shortPlaceholder: "Search…",
      }}
      emptyIcon={UsersIcon}
      emptyMessage="No employees yet. Connect Clover and run Sync from Clover."
      emptySearchMessage="No employees match your search."
      renderRow={(r) => (
        <>
          <TableCell className="font-medium">
            {r.name}
            {r.isOwner ? (
              <Badge variant="secondary" className="ml-2">
                Owner
              </Badge>
            ) : null}
          </TableCell>
          <TableCell>{r.nickname ?? "—"}</TableCell>
          <TableCell>{r.email ?? "—"}</TableCell>
          <TableCell className="text-muted-foreground text-xs uppercase">{r.role ?? "—"}</TableCell>
          <TableCell>
            <Badge variant={r.active ? "default" : "outline"}>{r.active ? "Active" : "Inactive"}</Badge>
          </TableCell>
          <TableCell className="text-muted-foreground font-mono text-xs">
            {r.cloverEmployeeId ?? "—"}
          </TableCell>
          <TableCell className="text-right">
            <SyncOneEmployeeButton publicId={r.publicId} disabled={!r.cloverEmployeeId} />
          </TableCell>
        </>
      )}
    />
  );
}
