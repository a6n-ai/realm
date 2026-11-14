import { Suspense } from "react";
import { and, eq, ne } from "drizzle-orm";
import { UsersIcon } from "lucide-react";
import { Card } from "@foundry/ui/card";
import { Separator } from "@foundry/ui/separator";
import { Skeleton } from "@foundry/ui/skeleton";
import { db } from "@/db/client";
import { leadSources, users } from "@/db/schema";
import { getLeadAssignment } from "@/lib/services/app-settings.service";
import { listConfig } from "@/lib/staff/owner-pool.service";
import { PageHeader } from "@/components/ds";
import { OwnerAssignmentForm, type TabState, type TabStates } from "./form";
import type { OwnerEntity } from "@/lib/staff/assignment";

type SearchParams = Promise<Record<string, string | undefined>>;

const ENTITIES: OwnerEntity[] = ["inquiry", "order", "ticket"];

export default function OwnerAssignmentPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="grid gap-6">
      <PageHeader icon={UsersIcon} title="Owner assignment" subtitle="Who new leads, orders and tickets go to." />
      <Suspense fallback={<OwnerAssignmentSkeleton />}>
        <OwnerAssignmentData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function OwnerAssignmentSkeleton() {
  return (
    <div className="grid gap-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-3">
        <Skeleton className="h-4 w-40" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="grid gap-2 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <Skeleton className="size-8" />
                <Skeleton className="size-4 rounded-full" />
              </div>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-36" />
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-3">
        <Skeleton className="h-4 w-32" />
        <Card className="gap-0 py-0">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              {i > 0 && <Separator />}
              <div className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="size-6 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-[18px] w-8 rounded-full" />
              </div>
            </div>
          ))}
          <Separator />
          <div className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-6 rounded-full" />
            <Skeleton className="h-4 w-56" />
          </div>
        </Card>
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-8 w-16" />
      </div>
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
      .where(and(ne(users.role, "user"), eq(users.isSystem, false))),
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
