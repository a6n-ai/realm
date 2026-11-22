import { requirePagePermission } from "@/lib/auth/guards";
import { OwnerAssignmentSkeleton } from "./owner-assignment-skeleton";
import { activeStaffWhere } from "@/lib/staff/staff-roster";
import { Suspense } from "react";
import { and, eq } from "drizzle-orm";
import { UsersIcon } from "lucide-react";
import { db } from "@/db/client";
import { leadSources, users } from "@/db/schema";
import { getLeadAssignment } from "@/lib/staff/lead-assignment-settings";
import { listConfig } from "@/lib/staff/owner-pool.service";
import { PageHeader } from "@/components/ds";
import { OwnerAssignmentForm, type TabState, type TabStates } from "./form";
import type { OwnerEntity } from "@/lib/staff/assignment";

type SearchParams = Promise<Record<string, string | undefined>>;

const ENTITIES: OwnerEntity[] = ["inquiry", "order", "ticket"];

export default async function OwnerAssignmentPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePagePermission({ settings: ["read"] });
  return (
    <div className="grid gap-6">
      <PageHeader icon={UsersIcon} title="Owner assignment" subtitle="Who new leads, orders and tickets go to." />
      <Suspense fallback={<OwnerAssignmentSkeleton />}>
        <OwnerAssignmentData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}


async function OwnerAssignmentData({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const initialEntity = ENTITIES.find((e) => e === sp.entity) ?? "inquiry";
  const [cfg, sources, staff, inquiryConfig, orderConfig, ticketConfig] = await Promise.all([
    getLeadAssignment(),
    db
      .select({ key: leadSources.key, label: leadSources.label })
      .from(leadSources)
      .where(and(eq(leadSources.active, true), eq(leadSources.isInbound, true))),
    db
      .select({ userId: users.id, publicId: users.publicId, name: users.name })
      .from(users)
      .where(activeStaffWhere()),
    listConfig("inquiry"),
    listConfig("order"),
    listConfig("ticket"),
  ]);

  const staffOptions = staff.map((s) => ({ userId: String(s.userId), publicId: s.publicId, name: s.name }));
  const idByPublicId = new Map(staffOptions.map((s) => [s.publicId, s.userId]));
  const pools = (rows: typeof inquiryConfig) => {
    const out: TabState["pools"] = { "": {} };
    for (const row of rows) {
      const userId = idByPublicId.get(row.userPublicId);
      if (userId) (out[row.sourceKey ?? ""] ??= {})[userId] = row.weight;
    }
    return out;
  };
  const initial: TabStates = {
    inquiry: { strategy: cfg.strategy, perSource: cfg.perSource, pools: pools(inquiryConfig) },
    order: { strategy: cfg.orders?.strategy ?? "round_robin", perSource: {}, pools: pools(orderConfig) },
    ticket: { strategy: cfg.tickets?.strategy ?? "round_robin", perSource: {}, pools: pools(ticketConfig) },
  };

  return <OwnerAssignmentForm initialEntity={initialEntity} initial={initial} sources={sources} staff={staffOptions} cursor={cfg.cursor} />;
}
