import { Avatar, AvatarFallback } from "@foundry/ui/avatar";
import { Badge } from "@foundry/ui/badge";
import { initials } from "@foundry/ui/initials";
import { UsersIcon } from "lucide-react";
import type { OrgChartPerson } from "../../lib/team/service";
import { EmptyState } from "../page/empty-state";
import { buildOrgTree, type OrgNode } from "./org-tree";
import { roleLabel } from "./role-select";

function PersonCard({ person }: { person: OrgChartPerson }) {
  return (
    <div className="grid w-56 gap-2 rounded-xl border bg-card p-3 text-left">
      <div className="flex items-center gap-2">
        <Avatar size="sm">
          <AvatarFallback>{initials(person.name)}</AvatarFallback>
        </Avatar>
        <span className="grid min-w-0">
          <span className="truncate text-sm font-medium text-(--strong)">{person.name}</span>
          <span className="text-xs text-muted-foreground">{roleLabel(person.role)}</span>
        </span>
      </div>
      {person.teams.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {person.teams.map((t) => (
            <Badge key={t} variant="outline">
              {t}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Branch({ node }: { node: OrgNode }) {
  return (
    <li>
      <PersonCard person={node} />
      {node.reports.length > 0 ? (
        <ul>
          {node.reports.map((r) => (
            <Branch key={r.memberId} node={r} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function OrgChart({ people }: { people: OrgChartPerson[] }) {
  const { roots, unplaced } = buildOrgTree(people);
  if (people.length === 0) return <EmptyState icon={UsersIcon} title="No people yet" description="Invite someone from Members to start the chart." />;
  return (
    <div className="grid gap-8">
      {roots.length > 0 ? (
        <div className="org-tree overflow-x-auto pb-2" aria-label="Reporting lines" role="region" tabIndex={0}>
          <ul>
            {roots.map((r) => (
              <Branch key={r.memberId} node={r} />
            ))}
          </ul>
        </div>
      ) : null}
      {unplaced.length > 0 ? (
        <section aria-label="Unplaced" className="grid gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Unplaced</h2>
          <ul className="flex flex-wrap gap-3">
            {unplaced.map((p) => (
              <li key={p.memberId}>
                <PersonCard person={p} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
