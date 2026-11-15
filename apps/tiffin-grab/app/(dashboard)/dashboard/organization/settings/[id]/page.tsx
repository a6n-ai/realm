import { notFound } from "next/navigation";
import { BackButton, SectionCard, UserAvatar } from "@/components/ds";
import { Badge } from "@/components/reui/badge";
import { canIn } from "@/lib/auth/guards";
import { getOrganization, listFranchiseCities, listMembers } from "@/lib/services/organizations.service";
import { getRoleChoicesFor } from "@/lib/auth/role-options";
import { getSession } from "@/lib/auth/session";
import { ClientDetailForm } from "./client-detail-form";
import { StaffSection } from "./staff-section";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await canIn(id, { member: ["update"] }))) notFound();
  const org = await getOrganization(id);
  if (!org) notFound();
  const [members, cities, parent, roleOptions, session] = await Promise.all([
    listMembers(id),
    listFranchiseCities(),
    org.parentOrganizationId ? getOrganization(org.parentOrganizationId) : null,
    getRoleChoicesFor(id),
    getSession(),
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

      <SectionCard title="Staff" subtitle="Staff who belong to this client, and their roles in it.">
        <StaffSection
          organizationId={id}
          rows={members.map((m) => ({
            memberId: m.memberId,
            userId: m.userId,
            email: m.email,
            roles: m.role.split(",").map((r) => r.trim()).filter(Boolean),
          }))}
          options={roleOptions}
          selfUserId={session?.user.id ?? ""}
        />
      </SectionCard>
    </>
  );
}
