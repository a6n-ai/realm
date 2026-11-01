import { Suspense } from "react";
import { and, eq, ne } from "drizzle-orm";
import { UsersIcon } from "lucide-react";
import { db } from "@/db/client";
import { leadSources, users } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { getLeadAssignment } from "@/lib/services/app-settings.service";
import { listConfig } from "@/lib/services/owner-pool.service";
import { PageHeader, SectionCard } from "@/components/ds";
import { EntityAssignmentForm, EntityAssignmentFormSkeleton, LeadAssignmentForm, LeadAssignmentFormSkeleton } from "./form";
import type { OwnerEntity } from "@/lib/services/assignment";

export default function OwnerAssignmentPage() {
  return (
    <div className="grid gap-6">
      <PageHeader icon={UsersIcon} title="Owner assignment" />
      <Suspense fallback={<OwnerAssignmentSkeleton />}>
        <OwnerAssignmentData />
      </Suspense>
    </div>
  );
}

function OwnerAssignmentSkeleton() {
  return (
    <>
      <SectionCard title="Inquiries" subtitle="Routing strategy, per-source overrides, and pool membership.">
        <LeadAssignmentFormSkeleton />
      </SectionCard>
      <SectionCard title="Orders" subtitle="Who owns orders nobody created by hand.">
        <EntityAssignmentFormSkeleton />
      </SectionCard>
      <SectionCard title="Tickets" subtitle="Who owns new tickets until staff reply.">
        <EntityAssignmentFormSkeleton />
      </SectionCard>
    </>
  );
}

async function OwnerAssignmentData() {
  await requireAdmin();
  const [cfg, sources, staff, inquiryConfig, orderConfig, ticketConfig] = await Promise.all([
    getLeadAssignment(),
    db
      .select({ key: leadSources.key, label: leadSources.label, isInbound: leadSources.isInbound })
      .from(leadSources)
      .where(and(eq(leadSources.active, true), eq(leadSources.isInbound, true))),
    db
      .select({ userId: users.id, publicId: users.publicId, name: users.name })
      .from(users)
      .where(and(ne(users.role, "user"), eq(users.isSystem, false))),
    listConfig("inquiry"),
    listConfig("order"),
    listConfig("ticket"),
  ]);

  const staffOptions = staff.map((s) => ({
    userId: String(s.userId),
    publicId: s.publicId,
    name: s.name,
  }));

  const idByPublicId = new Map(staffOptions.map((s) => [s.publicId, s.userId]));
  const members = (rows: typeof inquiryConfig) =>
    rows.flatMap((row) => {
      const userId = idByPublicId.get(row.userPublicId);
      return userId ? [{ userId, weight: row.weight }] : [];
    });
  const membership: Record<string, { userId: string; weight: number }[]> = {};
  for (const row of inquiryConfig) {
    const userId = idByPublicId.get(row.userPublicId);
    if (!userId) continue;
    (membership[row.sourceKey ?? ""] ??= []).push({ userId, weight: row.weight });
  }
  const entityCard = (entity: Exclude<OwnerEntity, "inquiry">, title: string, subtitle: string, rows: typeof inquiryConfig) => (
    <SectionCard title={title} subtitle={subtitle}>
      <EntityAssignmentForm
        entity={entity}
        strategy={(entity === "order" ? cfg.orders : cfg.tickets)?.strategy ?? "creator"}
        staff={staffOptions}
        initial={members(rows)}
      />
    </SectionCard>
  );

  return (
    <>
      <SectionCard title="Inquiries" subtitle="Routing strategy, per-source overrides, and pool membership.">
        <LeadAssignmentForm cfg={cfg} sources={sources} staff={staffOptions} membership={membership} />
      </SectionCard>
      {entityCard("order", "Orders", "A converted inquiry keeps its owner, and staff own orders they create. Other orders (customer checkout, renewals) come from this pool, then the default inquiry pool, then any active staff.", orderConfig)}
      {entityCard("ticket", "Tickets", "A staff member who creates a ticket owns it; new customer tickets come from this pool, then any active staff. The first staff reply claims a ticket owned by no staff member.", ticketConfig)}
    </>
  );
}
