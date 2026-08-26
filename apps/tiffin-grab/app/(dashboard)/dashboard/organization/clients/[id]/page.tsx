import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import { SectionCard } from "@/components/ds";
import { getOrganization, listMembers } from "@/lib/services/organizations.service";
import { ClientDetailForm } from "./client-detail-form";
import { MembersSection } from "../members-section";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const org = await getOrganization(id);
  if (!org) notFound();
  const members = await listMembers(id);

  return (
    <div className="space-y-4">
      <SectionCard title={org.name}>
        <ClientDetailForm organization={org} />
      </SectionCard>
      <SectionCard title="Members">
        <MembersSection organizationId={id} members={members} />
      </SectionCard>
    </div>
  );
}
