import { CoinRateFormSkeleton } from "./coin-rate-form-skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" className="grid gap-6">
      <CoinRateFormSkeleton />
    </div>
  );
}
