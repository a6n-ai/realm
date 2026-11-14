import { requireCustomerIdOrRedirect } from "@/lib/account/customer";
import { Suspense } from "react";
import { getAppSettings } from "@/lib/settings";
import { getReferralSummary } from "@/lib/referrals/referrals.service";
import { activeCoinRate } from "@/lib/referrals/offer";
import { walletService } from "@/lib/wallet/wallet.service";
import { PageHeader } from "@/components/kit";
import { ReferView } from "@/components/customer/refer/refer-view";
import { ReferSkeleton } from "@/components/customer/refer/refer-skeleton";

export default async function ReferPage() {
  const userId = await requireCustomerIdOrRedirect();
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <PageHeader eyebrow="Refer" title="Share TiffinGrab," accent="earn coins." subtitle="Friends who sign up with your code get coins too." />
      <Suspense fallback={<ReferSkeleton />}>
        <ReferData userId={userId} />
      </Suspense>
    </div>
  );
}

async function ReferData({ userId }: { userId: bigint }) {
  const [summary, coins, { currency }] = await Promise.all([
    getReferralSummary(userId),
    walletService.balance(userId),
    getAppSettings(),
  ]);
  const [dollars, rate] = await Promise.all([walletService.moneyValue(coins, currency), activeCoinRate(currency)]);
  return <ReferView summary={summary} wallet={{ coins, dollars }} rate={rate} />;
}
