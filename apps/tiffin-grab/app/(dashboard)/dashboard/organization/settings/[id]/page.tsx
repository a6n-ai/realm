import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import { BackButton, SectionCard, UserAvatar } from "@/components/ds";
import { Badge } from "@/components/reui/badge";
import { getOrganization, listFranchiseCities, listMembers, type MemberRole } from "@/lib/services/organizations.service";
import { ClientDetailForm } from "./client-detail-form";
import { MemberManagement } from "../member-management";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const org = await getOrganization(id);
  if (!org) notFound();
  const [members, cities, parent] = await Promise.all([
    listMembers(id),
    listFranchiseCities(),
    org.parentOrganizationId ? getOrganization(org.parentOrganizationId) : null,
  ]);
  const isBrand = !org.parentOrganizationId;

  return (
    <>
      <BackButton href="/dashboard/organization/settings" label="Clients" className="self-start" />

      <header className="flex min-w-0 items-center gap-3">
        <UserAvatar name={org.name} size="lg" />
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="truncate text-xl font-semibold tracking-tight">{org.name}</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {isBrand ? (
              <Badge variant="primary-light">Brand</Badge>
            ) : (
              <>
                <Badge variant="secondary">Franchise</Badge>
                {parent && <span className="text-muted-foreground">of {parent.name}</span>}
              </>
            )}
            <span className="text-muted-foreground font-mono text-xs">{org.clientCode}</span>
          </div>
        </div>
      </header>

      <ClientDetailForm organizationId={id} organization={org} cities={cities} isBrand={isBrand} />

      <SectionCard title="Members" subtitle="Staff who belong to this client, and their role in it.">
        <MemberManagement
          rows={members.map((m) => ({ organizationId: id, userPublicId: m.userId, label: m.email, role: m.role as MemberRole }))}
          fixed={{ organizationId: id }}
        />
      </SectionCard>
    </>
  );
}
