import { listCustomRoleNames } from "@/lib/services/organizations.service";
import { can, canAssignRole } from "./guards";
import { getOrgAccess, getOrgAccessFor } from "./org-access";
import { orgRoles } from "./permissions";
import { getSession } from "./session";

export type RoleOption = { value: string; label: string };

/** Built-in roles first, then the org's custom roles. Same list for the invite dialog and the members role select. */
export async function getRoleOptions(organizationId: string | null): Promise<RoleOption[]> {
  const custom = organizationId ? await listCustomRoleNames(organizationId) : [];
  return [...Object.keys(orgRoles), ...custom].map((value) => ({ value, label: value }));
}

export type RoleChoice = RoleOption & { locked?: boolean };

/** Options for one org, locked where the add, role and owner guards would refuse the viewer. */
export async function getRoleChoicesFor(organizationId: string): Promise<RoleChoice[]> {
  const access = await getOrgAccessFor(organizationId);
  const canGrantOwner = access.kind === "platform" || (access.kind === "member" && access.roles.includes(orgRoles.owner));
  return Promise.all(
    (await getRoleOptions(organizationId)).map(async (o) => {
      const ok = (o.value !== "owner" || canGrantOwner) && (await canAssignRole(organizationId, o.value));
      return ok ? o : { ...o, locked: true };
    }),
  );
}

/** Role options for the viewer's active org; locked when the viewer may not hand the role out (`owner`, or more than they hold). */
export async function getRoleChoices(): Promise<{ organizationId: string | null; options: RoleChoice[]; canGrantOwner: boolean; canInvite: boolean }> {
  const [session, access] = await Promise.all([getSession(), getOrgAccess()]);
  const organizationId = session?.session.activeOrganizationId ?? null;
  const canGrantOwner = access.kind === "platform" || (access.kind === "member" && access.roles.includes(orgRoles.owner));
  const options = await Promise.all(
    (await getRoleOptions(organizationId)).map(async (o) => {
      const locked = (o.value === "owner" && !canGrantOwner) || (!!organizationId && !(await canAssignRole(organizationId, o.value)));
      return locked ? { ...o, locked: true } : o;
    }),
  );
  return { organizationId, options, canGrantOwner, canInvite: await can({ invitation: ["create"], staff: ["invite"] }) };
}
