import type { OrgChartPerson } from "../../lib/team/service";

export type OrgNode = OrgChartPerson & { reports: OrgNode[] };

// Roots are people with no manager, or whose manager is not in the list. A root with nobody below is unplaced.
export function buildOrgTree(people: OrgChartPerson[]): { roots: OrgNode[]; unplaced: OrgNode[] } {
  const ids = new Set(people.map((p) => p.memberId));
  const kids = new Map<string, OrgChartPerson[]>();
  for (const p of people) if (p.managerMemberId && ids.has(p.managerMemberId)) kids.set(p.managerMemberId, [...(kids.get(p.managerMemberId) ?? []), p]);
  const node = (p: OrgChartPerson, seen: Set<string>): OrgNode => {
    const next = new Set(seen).add(p.memberId);
    return { ...p, reports: (kids.get(p.memberId) ?? []).filter((k) => !next.has(k.memberId)).map((k) => node(k, next)) };
  };
  const top = people.filter((p) => !p.managerMemberId || !ids.has(p.managerMemberId)).map((p) => node(p, new Set()));
  return { roots: top.filter((n) => n.reports.length > 0), unplaced: top.filter((n) => n.reports.length === 0) };
}
