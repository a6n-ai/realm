import { Skeleton } from "@foundry/ui/skeleton";
import { DeliveryChargesChrome } from "./delivery-charges-chrome";

// The manager body ships from @foundry/delivery with no exported frame, so only the header is real.
export default function Loading() {
  return (
    <DeliveryChargesChrome>
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </DeliveryChargesChrome>
  );
}
