import { Suspense } from "react";
import { parseFilterState, SectionCard, type FacetDef } from "@/components/ds";
import { StatCards, StatCardsSkeleton, type StatCardItem } from "@/components/dashboard/stat-cards";
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
            <StatCardsSkeleton count={5} />
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
  const [settings, s] = await Promise.all([getReferralSettings(), referralStats()]);
  const off = settings.referrerValue <= 0 && settings.friendValue <= 0;
  const pct = settings.mode === "pct";
  const stats: StatCardItem[] = [
    { label: "Rewards", value: off ? "Off" : `${settings.referrerValue}${pct ? "%" : ""} · ${settings.friendValue}${pct ? "%" : ""}`, hint: pct ? "% of first order: referrer · friend" : "Coins: referrer · friend" },
    { label: "Referrals", value: s.total.toLocaleString(), href: "/dashboard/wallet/referrals" },
    { label: "Rewarded", value: s.rewarded.toLocaleString(), hint: `${s.waiting.toLocaleString()} waiting on a first order`, href: "/dashboard/wallet/referrals?status=rewarded" },
    { label: "Coins to referrers", value: s.referrerCoins.toLocaleString() },
    { label: "Coins to friends", value: s.friendCoins.toLocaleString() },
  ];
  return (
    <>
      <StatCards items={stats} />
      <ReferralForm current={settings} />
    </>
  );
}

async function ReferralsData({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { page } = parseFilterState(SPEC, sp);
  const status = STATUSES.find((st) => st === sp.status);
  const { rows, total } = await listReferrals({ status, search: sp.q, page: page.page, pageSize: page.size });
  return <ReferralsTable rows={rows} spec={SPEC} total={total} page={page.page} size={page.size} />;
}
