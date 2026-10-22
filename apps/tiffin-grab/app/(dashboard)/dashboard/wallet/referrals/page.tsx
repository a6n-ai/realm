import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/guards";
import { parseFilterState, SectionCard, SkeletonStatCards, StatGrid, type FacetDef } from "@/components/ds";
import { getReferralSettings } from "@/lib/services/app-settings.service";
import { listReferrals, referralStats, type ReferralFriendStatus } from "@/lib/services/referrals.service";
import { REFERRAL_STATUS } from "./referral-status";
import { ReferralForm, ReferralFormSkeleton } from "./referral-form";
import { ReferralsTable, ReferralsTableSkeleton } from "./referrals-table";

const STATUSES = Object.keys(REFERRAL_STATUS) as ReferralFriendStatus[];

const SPEC: FacetDef[] = [
  { kind: "select", field: "status", label: "Status", options: STATUSES.map((s) => ({ value: s, label: REFERRAL_STATUS[s].label })) },
  { kind: "search", fields: ["referrer", "friend"] },
];

const LIST_TITLE = "Referrals";
const LIST_SUBTITLE = "Who referred whom, and what each side was paid.";

type SearchParams = Promise<Record<string, string | undefined>>;

// Stat cards, the rewards settings, then the list.
export default function DiscountReferralsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="grid grid-cols-1 gap-6">
      <Suspense
        fallback={
          <>
            <SkeletonStatCards count={5} className="md:grid-cols-2 lg:grid-cols-5" />
            <ReferralFormSkeleton />
          </>
        }
      >
        <SummaryData />
      </Suspense>
      <SectionCard title={LIST_TITLE} subtitle={LIST_SUBTITLE}>
        <Suspense fallback={<ReferralsTableSkeleton />}>
          <ReferralsData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </div>
  );
}

async function SummaryData() {
  await requireAdmin();
  const [settings, s] = await Promise.all([getReferralSettings(), referralStats()]);
  const off = settings.referrerValue <= 0 && settings.friendValue <= 0;
  const pct = settings.mode === "pct";
  const stats = [
    { label: "Rewards", value: off ? "Off" : `${settings.referrerValue}${pct ? "%" : ""} · ${settings.friendValue}${pct ? "%" : ""}`, hint: pct ? "% of first order: referrer · friend" : "Coins: referrer · friend" },
    { label: "Referrals", value: s.total.toLocaleString() },
    { label: "Rewarded", value: s.rewarded.toLocaleString(), hint: `${s.waiting.toLocaleString()} waiting on a first order` },
    { label: "Coins to referrers", value: s.referrerCoins.toLocaleString() },
    { label: "Coins to friends", value: s.friendCoins.toLocaleString() },
  ];
  return (
    <>
      <StatGrid cols={5} items={stats} />
      <ReferralForm current={settings} />
    </>
  );
}

async function ReferralsData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const sp = await searchParams;
  const { page } = parseFilterState(SPEC, sp);
  const status = STATUSES.find((st) => st === sp.status);
  const { rows, total } = await listReferrals({ status, search: sp.q, page: page.page, pageSize: page.size });
  return <ReferralsTable rows={rows} spec={SPEC} total={total} page={page.page} size={page.size} />;
}
