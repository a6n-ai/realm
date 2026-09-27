import { Suspense } from "react";
import { SectionCard } from "@/components/ds";
import { CustomersListSkeleton } from "../../customers/customers-list";
import { CustomersData } from "../../customers/page";

type SearchParams = Promise<Record<string, string | undefined>>;

export default function RenewalsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <SectionCard title="Upcoming Renewals">
        <Suspense fallback={<CustomersListSkeleton />}>
          <CustomersData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </div>
  );
}
