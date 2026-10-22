import { PageHeader } from "@/components/customer/kit";
import { ReferSkeleton } from "@/components/customer/refer/refer-skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" role="status" className="mx-auto w-full max-w-2xl space-y-6">
      <PageHeader eyebrow="Refer" title="Share TiffinGrab," accent="earn coins." subtitle="Friends who sign up with your code get coins too." />
      <ReferSkeleton />
    </div>
  );
}
