import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { leadSources, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { getLeadAssignment } from "@/lib/services/app-settings.service";
import { listConfig } from "@/lib/services/inquiry-user-config.service";
import { SectionCard } from "@/components/ds";
import { LeadAssignmentForm } from "./form";

export default async function LeadAssignmentPage() {
  await requireAdmin();
  const [cfg, sources, staff, config] = await Promise.all([
    getLeadAssignment(),
    db
      .select({ key: leadSources.key, label: leadSources.label, isInbound: leadSources.isInbound })
      .from(leadSources)
      .where(and(eq(leadSources.active, true), eq(leadSources.isInbound, true))),
    db
      .select({ userId: users.id, publicId: users.publicId, name: users.name })
      .from(users)
      .where(and(ne(users.role, "user"), eq(users.isSystem, false))),
    listConfig(),
  ]);

  const staffOptions = staff.map((s) => ({
    userId: String(s.userId),
    publicId: s.publicId,
    name: s.name,
  }));

  // Group memberships by source key ("" = default pool), mapping userPublicId -> users.id string.
  const idByPublicId = new Map(staffOptions.map((s) => [s.publicId, s.userId]));
  const membership: Record<string, { userId: string; weight: number }[]> = {};
  for (const row of config) {
    const key = row.sourceKey ?? "";
    const userId = idByPublicId.get(row.userPublicId);
    if (!userId) continue;
    (membership[key] ??= []).push({ userId, weight: row.weight });
  }

  return (
    <SectionCard
      title="Strategy & pools"
      subtitle="Routing strategy, per-source overrides, and pool membership."
    >
      <LeadAssignmentForm cfg={cfg} sources={sources} staff={staffOptions} membership={membership} />
    </SectionCard>
  );
}
