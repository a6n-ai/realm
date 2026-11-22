import { PageShell } from "@/components/ds";
import { OrderDetailSkeleton } from "./order-detail-skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <PageShell>
        <OrderDetailSkeleton />
      </PageShell>
    </div>
  );
}
