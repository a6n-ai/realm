// Pure: the "Needs attention" rules for the Organization overview. Loading the rows lives in org-health-query.ts.

export const EXPIRING_WITHIN_MS = 48 * 60 * 60 * 1000;

export type AttentionInput = {
  now: number;
  invites: { status: string; expiresAt: Date | string | null }[];
  /** Member rows across the visible orgs; `role` is the comma list stored on the row. */
  members: { organizationId: string; role: string }[];
  customRoles: { organizationId: string; role: string }[];
  builtIns: readonly string[];
  franchises: { id: string; name: string }[];
  /** Orgs where the viewer passes member:update. Owner gaps are shown only for these. */
  manageable: ReadonlySet<string>;
};

export type Attention = {
  expiringInvites: number;
  expiredInvites: number;
  /** Member rows whose roles resolve to nothing: empty, or only roles that no longer exist. */
  noRoleMemberships: number;
  ownerlessFranchises: { id: string; name: string }[];
};

const roleNames = (role: string) => role.split(",").map((r) => r.trim()).filter(Boolean);

export function summarizeAttention(input: AttentionInput): Attention {
  const { now, invites, members, customRoles, builtIns, franchises, manageable } = input;

  const customByOrg = new Map<string, Set<string>>();
  for (const r of customRoles) {
    const names = customByOrg.get(r.organizationId) ?? new Set<string>();
    names.add(r.role);
    customByOrg.set(r.organizationId, names);
  }
  const resolves = (organizationId: string, name: string) =>
    builtIns.includes(name) || (customByOrg.get(organizationId)?.has(name) ?? false);

  let expiringInvites = 0;
  let expiredInvites = 0;
  for (const invite of invites) {
    if (invite.status !== "pending" || invite.expiresAt == null) continue;
    const expiresAt = new Date(invite.expiresAt).getTime();
    if (expiresAt < now) expiredInvites++;
    else if (expiresAt - now <= EXPIRING_WITHIN_MS) expiringInvites++;
  }

  const owned = new Set(members.filter((m) => roleNames(m.role).includes("owner")).map((m) => m.organizationId));

  return {
    expiringInvites,
    expiredInvites,
    noRoleMemberships: members.filter((m) => !roleNames(m.role).some((n) => resolves(m.organizationId, n))).length,
    ownerlessFranchises: franchises.filter((f) => manageable.has(f.id) && !owned.has(f.id)),
  };
}
