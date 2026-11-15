import type { AccessRow, ResourceLabel } from "@foundry/crm";
import type { MemberRow } from "./members-query";
import { hasFullAccess, heldAreas, type AreaBadge } from "./access-areas";

export type PeopleRow = MemberRow & {
  /** Roles resolved from the member's permissions, the same set the guards use. */
  roles: string[];
  areas: AreaBadge[];
  areaIds: string[];
  fullAccess: boolean;
  isSelf: boolean;
  /** Holds a role the viewer may not grant or manage, so the row's role edits are refused. */
  targetAboveViewer: boolean;
};

/** A member with no access entry gets empty roles and areas, so it shows as "No role". */
export function toPeopleRows(
  members: MemberRow[],
  access: AccessRow[],
  resources: ResourceLabel[],
  selfId: string | null,
  aboveViewer: string[],
): PeopleRow[] {
  const byMember = new Map(access.map((a) => [a.id, a]));
  return members.map((m) => {
    const a = byMember.get(m.memberId);
    const permissions = a?.permissions ?? {};
    const areas = heldAreas(permissions, resources);
    const roles = a?.roles ?? [];
    return {
      ...m,
      roles,
      areas,
      areaIds: areas.map((x) => x.resource),
      fullAccess: hasFullAccess(permissions, resources),
      isSelf: selfId === m.id,
      targetAboveViewer: roles.some((r) => aboveViewer.includes(r)),
    };
  });
}
