import { SectionCard } from "@/components/ds";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

// Loading twin for CoinRateForm (colocated because the form lives one dir up and
// is shared out of this route). Mirrors the same SectionCard + field layout with
// real labels and grey blocks where the currency value / input / button go.
export function CoinRateFormSkeleton() {
  return (
    <SectionCard
      title="Coin rate"
      subtitle="Sets the CAD value of one coin. Each save creates a versioned rate record; historical rates are preserved."
    >
      <div className="grid max-w-sm gap-4">
        <div className="grid gap-1.5">
          <Label>Currency</Label>
          <Skeleton className="h-5 w-12" />
        </div>
        <div className="grid gap-1.5">
          <Label>Value per coin (CAD)</Label>
          <Skeleton className="h-9 w-full" />
        </div>
        <Skeleton className="h-9 w-24" />
      </div>
    </SectionCard>
  );
}
