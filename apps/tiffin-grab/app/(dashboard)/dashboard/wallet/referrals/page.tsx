import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/guards";
import { parseFilterState, type FacetDef } from "@/components/ds";
import { listReferrals, type ReferralFriendStatus } from "@/lib/services/referrals.service";
import { REFERRAL_STATUS } from "./referral-status";
import { ReferralsTable, ReferralsTableSkeleton } from "./referrals-table";

const STATUSES = Object.keys(REFERRAL_STATUS) as ReferralFriendStatus[];

const SPEC: FacetDef[] = [
  { kind: "select", field: "status", label: "Status", options: STATUSES.map((s) => ({ value: s, label: REFERRAL_STATUS[s].label })) },
  { kind: "search", fields: ["referrer", "friend"] },
];

type SearchParams = Promise<Record<string, string | undefined>>;

export default function WalletReferralsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<ReferralsTableSkeleton />}>
      <ReferralsData searchParams={searchParams} />
    </Suspense>
  );
}

async function ReferralsData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const { page } = parseFilterState(SPEC, sp);
  const status = STATUSES.find((s) => s === sp.status);
  const { rows, total } = await listReferrals({ status, search: sp.q, page: page.page, pageSize: page.size });
  return <ReferralsTable rows={rows} spec={SPEC} total={total} page={page.page} size={page.size} />;
}
