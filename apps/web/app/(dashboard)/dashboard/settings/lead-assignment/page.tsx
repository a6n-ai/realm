import { SettingsIcon } from "lucide-react";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { leadSources, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { getLeadAssignment } from "@/lib/services/app-settings.service";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { LeadAssignmentForm } from "./form";

export default async function LeadAssignmentPage() {
  await requireAdmin();
  const [cfg, sources, members] = await Promise.all([
    getLeadAssignment(),
    db
      .select({ key: leadSources.key, label: leadSources.label, isInbound: leadSources.isInbound })
      .from(leadSources)
      .where(and(eq(leadSources.active, true), eq(leadSources.isInbound, true))),
    db
      .select({ publicId: users.publicId, name: users.name })
      .from(users)
      .where(eq(users.acceptsLeads, true)),
  ]);

  return (
    <PageShell>
      <PageHeader icon={SettingsIcon} title="Lead assignment" subtitle="Routing strategy, per-source overrides, and percentage weights" />
      <SectionCard title="Strategy">
        <LeadAssignmentForm cfg={cfg} sources={sources} members={members} />
      </SectionCard>
    </PageShell>
  );
}
