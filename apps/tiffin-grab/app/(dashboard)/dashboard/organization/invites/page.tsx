import { headers } from "next/headers";
import { Suspense } from "react";
import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { getSession } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/auth/guards";
import { resolveMemberVisibleOrgIds, listOrganizations } from "@/lib/services/organizations.service";
import { SectionCard } from "@/components/ds";
import { InvitesList, type InviteRow } from "./invites-list";

export default function InvitesPage() {
  return (
    <SectionCard title="Invitations">
      <Suspense fallback={null}>
        <InvitesData />
      </Suspense>
    </SectionCard>
  );
}

async function InvitesData() {
  await requireAdmin();
  const session = await getSession();
  const visible = await resolveMemberVisibleOrgIds(session);
  const orgIds = visible === "all" ? (await listOrganizations()).map((o) => o.id) : visible;

  if (orgIds.length === 0) return <InvitesList rows={[]} />;

  // better-auth's listInvitations is org-scoped per call — fetch per org and merge,
  // same "small staff-scale dataset" pattern as clients-list.tsx / members-query.ts.
  const h = await headers();
  const results = await Promise.all(
    orgIds.map((organizationId) => auth.api.listInvitations({ query: { organizationId }, headers: h })),
  );
  const invitations = results.flat();

  // listInvitations' row shape has no userId (confirmed against the installed
  // better-auth 1.6.30 types) — resolve it via a batched email lookup instead
  // of one query per row.
  const emails = [...new Set(invitations.map((inv) => inv.email))];
  const matches = emails.length
    ? await db.select({ id: users.publicId, email: users.email }).from(users).where(inArray(users.email, emails))
    : [];
  const userIdByEmail = new Map(matches.map((u) => [u.email, u.id]));

  const rows: InviteRow[] = invitations.map((inv) => ({
    id: inv.id,
    userId: userIdByEmail.get(inv.email) ?? "",
    email: inv.email,
    role: inv.role ?? "member",
    status: inv.status,
    expiresAt: new Date(inv.expiresAt).toISOString(),
    organizationId: inv.organizationId,
  }));

  return <InvitesList rows={rows} />;
}
