import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import { SectionCard } from "@realm/design-system";
import { getOrganization, listMembers, type MemberRole } from "@/lib/services/organizations.service";
import { resolveOrgScopeMode } from "@/lib/services/org-scope";
import { ClientDetailForm } from "./client-detail-form";
import { MemberManagement } from "../member-management";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  // requireAdmin has no org concept — without this, a franchise-scoped admin
  // could open another franchise's (or the brand's) detail page directly by
  // URL. 404 rather than a 403: same response shape as an id that doesn't
  // exist, so a franchise session can't distinguish "not yours" from "no
  // such org" by probing ids.
  const scopeMode = await resolveOrgScopeMode();
  if (scopeMode.mode === "org" && scopeMode.orgId !== id) notFound();
  const org = await getOrganization(id);
  if (!org) notFound();
  const members = await listMembers(id);

  return (
    <div className="space-y-4">
      <SectionCard title={org.name}>
        <ClientDetailForm organizationId={id} organization={org} />
      </SectionCard>
      <SectionCard title="Members">
        <MemberManagement
          rows={members.map((m) => ({ organizationId: id, userPublicId: m.userId, label: m.email, role: m.role as MemberRole }))}
          organizationId={id}
        />
      </SectionCard>
    </div>
  );
}
