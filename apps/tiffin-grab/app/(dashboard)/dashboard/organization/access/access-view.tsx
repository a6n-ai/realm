"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UsersIcon } from "lucide-react";
import { AccessMatrix, RoleChips, WhoCanSearch, whoCan, type AccessRow, type ResourceLabel } from "@foundry/crm";
import { Button } from "@foundry/ui/button";
import { EmptyState } from "@/components/ds";
import { setMemberRoles } from "../members/actions";
import { chipReasons, type RoleChoice } from "./role-chip-reasons";

type Props = {
  rows: AccessRow[];
  noRole: string[];
  platformAdmins: { name: string; email: string }[];
  resources: ResourceLabel[];
  roleOptions: RoleChoice[];
  selfEmail: string | null;
};

export function AccessView({ rows, noRole, platformAdmins, resources, roleOptions, selfEmail }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState<string>();
  const reason = chipReasons(rows, roleOptions, selfEmail);
  const names = new Map(rows.map((r) => [r.id, r.name]));

  async function save(row: AccessRow, roles: string[]): Promise<{ error?: string }> {
    const res = await setMemberRoles(row.id, roles);
    if ("error" in res) return { error: res.error };
    router.refresh();
    return {};
  }

  return (
    <div className="grid gap-6">
      <WhoCanSearch
        value={query}
        onChange={setQuery}
        results={whoCan(rows, resources, query)}
        nameOf={(id) => names.get(id) ?? id}
      />
      {noRole.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {noRole.length} {noRole.length === 1 ? "person has" : "people have"} no role, so no access. Give them a role.
        </p>
      )}
      <AccessMatrix
        rows={rows}
        resources={resources}
        platformAdmins={platformAdmins}
        highlight={highlight}
        onRowOpen={setHighlight}
        renderChips={(row) => (
          <RoleChips
            roles={row.roles}
            options={roleOptions}
            onAdd={(role) => save(row, [...row.roles, role])}
            onRemove={(role) => save(row, row.roles.filter((r) => r !== role))}
            disabledReason={(role, op) => reason(row, role, op)}
          />
        )}
        emptyState={
          <EmptyState
            icon={UsersIcon}
            message="No members yet"
            action={
              <Button asChild size="sm">
                <Link href="/dashboard/organization/members">Invite someone</Link>
              </Button>
            }
          />
        }
      />
    </div>
  );
}
