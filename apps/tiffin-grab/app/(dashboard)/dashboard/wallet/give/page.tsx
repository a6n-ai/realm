import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/guards";
import { Skeleton } from "@foundry/ui/skeleton";
import { listOrderCities } from "@/lib/services/customer-payouts.service";
import { CustomerPayoutPanel } from "../customer-payout-panel";

export default function GiveCoinsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <GiveCoinsData />
    </Suspense>
  );
}

async function GiveCoinsData() {
  await requireAdmin();
  const cities = await listOrderCities();
  return <CustomerPayoutPanel cities={cities} />;
}
