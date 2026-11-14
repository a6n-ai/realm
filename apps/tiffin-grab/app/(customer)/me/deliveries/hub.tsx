import { requireCustomerIdOrRedirect } from "@/lib/account/customer";
import { Suspense } from "react";
import { after } from "next/server";
import { expireUnpaidStripeOrders } from "@/lib/orders/unpaid-checkouts";
import { DeliveriesSkeleton } from "@/components/customer/deliveries/deliveries-skeleton";
import { DeliveriesView } from "@/components/customer/deliveries/deliveries-view";
import { NoPlan } from "@/components/customer/deliveries/no-plan";
import { loadCustomerDeliveries, type CustomerDeliveriesQuery } from "@/lib/deliveries/view/customer-plan.service";

export type HubSearchParams = Promise<CustomerDeliveriesQuery>;
type SearchParams = HubSearchParams;

export function DeliveriesHub({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<DeliveriesSkeleton />}>
      <MyDeliveriesData searchParams={searchParams} />
    </Suspense>
  );
}

async function MyDeliveriesData({ searchParams }: { searchParams: SearchParams }) {
  const userId = await requireCustomerIdOrRedirect();
  after(() => expireUnpaidStripeOrders({ userId }));

  const data = await loadCustomerDeliveries(userId, await searchParams);
  if (data.kind === "none") return <NoPlan waitlisted={data.waitlisted} ended={data.ended} cardAvailable={data.cardAvailable} />;

  return (
    <div className="mx-auto w-full max-w-[1280px]">
      <DeliveriesView {...data} />
    </div>
  );
}
