import { requireCustomerIdOrRedirect } from "@/lib/account/customer";
import { Suspense } from "react";
import { getAppSettings } from "@/lib/settings";
import { getReferralSummary } from "@/lib/referrals/referrals.service";
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
  const [dollars, perCoin] = await Promise.all([
    walletService.moneyValue(coins, currency),
    // Display only; no rate set for this currency means coins-only cards.
    walletService.activeRate(currency).catch(() => null),
  ]);
  return <ReferView summary={summary} wallet={{ coins, dollars }} rate={perCoin == null ? null : { perCoin, currency }} />;
}
