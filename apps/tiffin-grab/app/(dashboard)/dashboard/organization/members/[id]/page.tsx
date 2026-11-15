import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { getMembersForOrgs } from "../members-query";

// Old deep links carry the user publicId; the member page is keyed by membership id.
export default async function MemberRedirect({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission({ member: ["update"] });
  const { id } = await params;
  const session = await getSession();
  const orgId = session?.session.activeOrganizationId;
  const row = orgId ? (await getMembersForOrgs([orgId])).find((m) => m.id === id) : undefined;
  redirect(row ? `/dashboard/organization/people/${row.memberId}` : "/dashboard/organization/people");
}
