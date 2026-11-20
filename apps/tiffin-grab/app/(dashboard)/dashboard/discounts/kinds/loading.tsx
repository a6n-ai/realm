import { DiscountStatsSkeleton } from "../discount-stats";
import { KindsFormSkeleton } from "./form";

export default function Loading() {
  return (
    <div className="grid grid-cols-1 gap-6">
      <DiscountStatsSkeleton />
      <KindsFormSkeleton />
    </div>
  );
}
