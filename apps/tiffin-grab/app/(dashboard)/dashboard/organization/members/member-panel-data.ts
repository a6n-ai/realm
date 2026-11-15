import type { AccessRow, ChipContext, PermissionMap } from "@foundry/crm";
import { can, canIn } from "@/lib/auth/guards";
import { effectivePermissions, getOrgAccess } from "@/lib/auth/org-access";
import { getRoleChoices, getRoleChoicesFor, type RoleChoice, type RoleOption } from "@/lib/auth/role-options";
import { getSession } from "@/lib/auth/session";
import { getOrgAccessMatrix } from "@/lib/services/org-access-matrix";
import { listMembershipsForUser, listOrganizations } from "@/lib/services/organizations.service";
import { getMembersForOrgs, type MemberRow } from "./members-query";

export type MemberPanelData = {
  member: MemberRow;
  activeOrgId: string;
  /** The person's roles and the permissions they resolve to, from the same resolver the guards use. */
  access: AccessRow;
  chips: ChipContext;
  options: RoleChoice[];
  /** The viewer's own effective permissions: what "Create a role from these permissions" may grant. */
  grantable: PermissionMap;
  canCreateRole: boolean;
  /** The active org's role, plus other orgs by name only where the viewer may manage members. */
  memberships: { organizationId: string; name: string; role: string | null }[];
  /** Orgs the viewer may add this person to and the person is not in yet, with the roles the viewer may give there. */
  addableOrgs: { id: string; name: string; roles: RoleOption[] }[];
};

/** `memberId` is member.id (the org membership), not the user's publicId. Null when not visible to the viewer. */
export async function loadMemberPanel(memberId: string): Promise<MemberPanelData | null> {
  if (!(await can({ member: ["update"] }))) return null;
  const session = await getSession();
  const orgId = session?.session.activeOrganizationId;
  if (!session || !orgId) return null;

  const member = (await getMembersForOrgs([orgId])).find((m) => m.memberId === memberId);
  if (!member) return null;

  const [matrix, choices, viewer, canCreateRole, memberships, orgs] = await Promise.all([
    getOrgAccessMatrix(orgId),
    getRoleChoices(),
    getOrgAccess(),
    can({ ac: ["create"] }),
    listMembershipsForUser(member.id),
    listOrganizations(),
  ]);
  const access = matrix.rows.find((r) => r.id === memberId);
  if (!access) return null;

  // Mirrors the server guards (requireCanAssignRole, requireCanActOnRoles, the last-owner rule).
  const aboveViewer = choices.options.filter((o) => o.locked).map((o) => o.value);
  const owners = matrix.rows.filter((r) => r.roles.includes("owner")).length;
  const notIn = new Set(memberships.map((m) => m.organizationId));
  const manageableFlags = await Promise.all(orgs.map((o) => canIn(o.id, { member: ["update"] })));
  const manageable = new Set(orgs.filter((_, i) => manageableFlags[i]).map((o) => o.id));
  const addable = orgs.filter((o) => !notIn.has(o.id) && manageable.has(o.id));
  const addableOrgs = await Promise.all(
    addable.map(async (o) => ({
      id: o.id,
      name: o.name,
      roles: (await getRoleChoicesFor(o.id)).filter((r) => !r.locked),
    })),
  );

  return {
    member,
    activeOrgId: orgId,
    access,
    chips: {
      self: session.user.id === member.id,
      roleCount: access.roles.length,
      targetAboveViewer: access.roles.some((r) => aboveViewer.includes(r)),
      lastOwnerRole: owners <= 1 ? "owner" : undefined,
      aboveViewer,
    },
    options: choices.options,
    grantable: effectivePermissions(viewer),
    canCreateRole,
    memberships: memberships
      .filter((m) => m.organizationId === orgId || manageable.has(m.organizationId))
      .map((m) => ({
        organizationId: m.organizationId,
        name: m.organizationName,
        role: m.organizationId === orgId ? m.role : null,
      })),
    addableOrgs: addableOrgs.filter((o) => o.roles.length > 0),
  };
}
