import { SectionCard } from "@/components/ds";
import { StatCardsSkeleton } from "@/components/dashboard/stat-cards";
import { ReferralFormSkeleton } from "./referral-form";
import { ReferralsTableSkeleton } from "./referrals-table";

export default function Loading() {
  return (
    <div className="grid grid-cols-1 gap-6">
      <StatCardsSkeleton count={5} />
      <ReferralFormSkeleton />
      <SectionCard title="Referrals" subtitle="Who referred whom, and what each side was paid.">
        <ReferralsTableSkeleton />
      </SectionCard>
    </div>
  );
}
