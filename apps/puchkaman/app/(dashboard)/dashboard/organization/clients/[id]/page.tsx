import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import { SectionCard } from "@realm/design-system";
import { getOrganization, listMembers, type MemberRole } from "@/lib/services/organizations.service";
import { ClientDetailForm } from "./client-detail-form";
import { MemberManagement } from "../member-management";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
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
