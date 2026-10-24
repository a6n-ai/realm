import { DeliveriesSkeleton } from "@/components/customer/deliveries/deliveries-skeleton";

// /me is the deliveries hub, so its segment fallback is the hub's own skeleton (no swap when hub.tsx's Suspense takes over).
export default function Loading() {
  return <DeliveriesSkeleton />;
}
