import { UsersIcon } from "lucide-react";
import { RESOURCE_LABELS } from "@/lib/auth/permissions";
import { getRoleChoices } from "@/lib/auth/role-options";
import { getSession } from "@/lib/auth/session";
import { getOrgAccessMatrix } from "@/lib/services/org-access-matrix";
import { EmptyState, SectionCard } from "@/components/ds";
import { AccessView } from "./access-view";

export default async function AccessPage() {
  const session = await getSession();
  const organizationId = session?.session.activeOrganizationId;
  if (!organizationId) {
    return (
      <SectionCard title="Access">
        <EmptyState icon={UsersIcon} message="Select an organization to see who has access." />
      </SectionCard>
    );
  }
  // An unreadable matrix throws to organization/error.tsx, which shows the inline error with Retry.
  const [matrix, choices] = await Promise.all([getOrgAccessMatrix(organizationId), getRoleChoices()]);
  return (
    <SectionCard
      title="Access"
      subtitle="Who has access to what in this organization. Each person's access is the union of their roles."
    >
      <AccessView
        rows={matrix.rows}
        noRole={matrix.noRole}
        platformAdmins={matrix.platformAdmins}
        resources={RESOURCE_LABELS}
        roleOptions={choices.options}
        selfEmail={session?.user.email ?? null}
      />
    </SectionCard>
  );
}
