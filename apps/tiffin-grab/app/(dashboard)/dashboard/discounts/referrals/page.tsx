import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/guards";
import { parseFilterState, SkeletonFormCard, type FacetDef } from "@/components/ds";
import { listReferrals, type ReferralFriendStatus } from "@/lib/services/referrals.service";
import { getReferralSettings } from "@/lib/services/app-settings.service";
import { ReferralForm } from "./referral-form";
import { REFERRAL_STATUS } from "./referral-status";
import { ReferralsTable, ReferralsTableSkeleton } from "./referrals-table";

const STATUSES = Object.keys(REFERRAL_STATUS) as ReferralFriendStatus[];

const SPEC: FacetDef[] = [
  { kind: "select", field: "status", label: "Status", options: STATUSES.map((s) => ({ value: s, label: REFERRAL_STATUS[s].label })) },
  { kind: "search", fields: ["referrer", "friend"] },
];

type SearchParams = Promise<Record<string, string | undefined>>;

export default function DiscountReferralsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="grid gap-6">
      <Suspense fallback={<SkeletonFormCard fields={4} />}>
        <ReferralSettingsData />
      </Suspense>
      <Suspense fallback={<ReferralsTableSkeleton />}>
        <ReferralsData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ReferralSettingsData() {
  await requireAdmin();
  return <ReferralForm current={await getReferralSettings()} />;
}

async function ReferralsData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const { page } = parseFilterState(SPEC, sp);
  const status = STATUSES.find((s) => s === sp.status);
  const { rows, total } = await listReferrals({ status, search: sp.q, page: page.page, pageSize: page.size });
  return <ReferralsTable rows={rows} spec={SPEC} total={total} page={page.page} size={page.size} />;
}
