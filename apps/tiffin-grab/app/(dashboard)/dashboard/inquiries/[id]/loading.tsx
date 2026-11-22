import { PageShell } from "@/components/ds";
import { InquiryDetailSkeleton } from "./inquiry-detail-skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" className="contents">
      <PageShell>
        <InquiryDetailSkeleton />
      </PageShell>
    </div>
  );
}
