import { DiscountLogsSkeleton } from "./discount-logs";

export default function Loading() {
  return (
    <div className="grid grid-cols-1 gap-6">
      <DiscountLogsSkeleton />
    </div>
  );
}
