import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/services/session-service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { getReferralSummary } from "@/lib/services/referrals.service";
import { walletService } from "@/lib/services/wallet.service";
import { PageHeader } from "@/components/customer/kit";
import { ReferView } from "@/components/customer/refer/refer-view";
import { ReferSkeleton } from "@/components/customer/refer/refer-skeleton";

export default async function ReferPage() {
  const userId = await currentUserId();
  if (userId == null) redirect("/login");
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
  const dollars = await walletService.moneyValue(coins, currency);
  return <ReferView summary={summary} wallet={{ coins, dollars }} />;
}
