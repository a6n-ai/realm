"use client";

import { UsersIcon } from "lucide-react";
import { DataTable } from "@/components/ds";
import { Badge } from "@/components/reui/badge";
import { TableCell } from "@foundry/ui/table";
import type { GrantMember } from "./types";

const COLUMNS = [
  { key: "name", label: "Customer" },
  { key: "email", label: "Email" },
  { key: "status", label: "Status" },
] as const;

const STATUS = {
  awarded: { label: "Awarded", variant: "success-light" },
  capped: { label: "Blocked by cap", variant: "warning-light" },
  no_email: { label: "No email", variant: "secondary" },
} as const;

export function GrantMemberList({ members }: { members: GrantMember[] }) {
  return (
    <DataTable
      pagination="client"
      pageSize={10}
      serial={false}
      columns={COLUMNS}
      rows={members}
      rowKey={(m) => m.publicId}
      emptyIcon={UsersIcon}
      emptyMessage="No customers in this group"
      renderRow={(m) => (
        <>
          <TableCell className="font-medium">{m.name ?? "Customer"}</TableCell>
          <TableCell className="text-muted-foreground">{m.email ?? "-"}</TableCell>
          <TableCell>
            <Badge variant={STATUS[m.status].variant}>{STATUS[m.status].label}</Badge>
          </TableCell>
        </>
      )}
    />
  );
}
