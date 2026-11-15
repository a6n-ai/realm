"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UsersIcon } from "lucide-react";
import { AccessMatrix, RoleChips, WhoCanSearch, whoCan, type AccessRow, type ResourceLabel } from "@foundry/crm";
import { Button } from "@foundry/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
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
  const [roleFilter, setRoleFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const reason = chipReasons(rows, roleOptions, selfEmail);
  const names = new Map(rows.map((r) => [r.id, r.name]));
  const hits = whoCan(rows, resources, query);
  // A "Who can" query narrows the rows to its holders; the matrix does not highlight columns.
  const holderIds = hits.length ? new Set(hits.flatMap((h) => h.holders.map((x) => x.rowId))) : null;
  const shownRows = rows.filter((r) => (roleFilter === "all" || r.roles.includes(roleFilter)) && (!holderIds || holderIds.has(r.id)));
  const shownResources = areaFilter === "all" ? resources : resources.filter((r) => r.resource === areaFilter);

  async function save(row: AccessRow, roles: string[]): Promise<{ error?: string }> {
    const res = await setMemberRoles(row.id, roles);
    if ("error" in res) return { error: res.error };
    router.refresh();
    return {};
  }

  function clearFilters() {
    setQuery("");
    setRoleFilter("all");
    setAreaFilter("all");
  }

  return (
    <div className="grid gap-6">
      <WhoCanSearch
        value={query}
        onChange={setQuery}
        results={hits}
        nameOf={(id) => names.get(id) ?? id}
      />
      {noRole.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {noRole.length} {noRole.length === 1 ? "person has" : "people have"} no role, so no access. Give them a role.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger size="sm" className="min-w-40" aria-label="Filter by role">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {roleOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={areaFilter} onValueChange={setAreaFilter}>
          <SelectTrigger size="sm" className="min-w-40" aria-label="Filter by area">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All areas</SelectItem>
            {resources.map((r) => (
              <SelectItem key={r.resource} value={r.resource}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <AccessMatrix
        rows={shownRows}
        resources={shownResources}
        platformAdmins={platformAdmins}
        onRowOpen={(id) => router.push(`/dashboard/organization/members?member=${id}`)}
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
          rows.length > 0 ? (
            <EmptyState
              icon={UsersIcon}
              message="No one matches these filters."
              action={
                <Button size="sm" variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={UsersIcon}
              message="No members yet"
              action={
                <Button asChild size="sm">
                  <Link href="/dashboard/organization/members">Invite someone</Link>
                </Button>
              }
            />
          )
        }
      />
    </div>
  );
}
