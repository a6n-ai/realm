// Client-safe: the invites table, the invite query, the stats cards and the members list all read it.

export type InviteRow = {
  id: string;
  userId: string; // users.publicId, needed for resendInvite's signature
  email: string;
  role: string;
  status: "pending" | "accepted" | "rejected" | "canceled";
  expiresAt: string; // ISO
  organizationId: string;
};

/** The DB only stores "pending"; a pending invite past its expiry is expired. The SQL twin is in invites-query.ts. */
export function isInviteExpired(status: string, expiresAt: Date | string | null, now: number): boolean {
  return status === "pending" && expiresAt != null && new Date(expiresAt).getTime() < now;
}
