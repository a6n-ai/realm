import { Suspense } from "react";
import { CalendarHeartIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard, parseFilterState, type FacetDef } from "@foundry/design-system";
import { requirePermission } from "@/lib/auth/guards";
import { parseSort } from "@/lib/list/sort";
import { listCateringInquiriesPage, type CateringSortColumn } from "@/lib/services/catering.service";
import { CateringTable, CateringTableSkeleton } from "./catering-table";

type SearchParams = Promise<Record<string, string | undefined>>;

const shopDate = (ms: number) =>
  new Date(ms).toLocaleDateString("en-CA", { timeZone: "America/Toronto" });

const SORT_COLUMNS = [
  "submitted",
  "name",
  "eventDate",
  "guests",
] as const satisfies readonly CateringSortColumn[];

const SPEC: FacetDef[] = [{ kind: "search", fields: ["name", "phone", "email"] }];

export default function CateringPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <PageHeader
        icon={CalendarHeartIcon}
        title="Catering"
        subtitle="Quote requests submitted from the public catering page."
      />
      <SectionCard title="Requests">
        <Suspense fallback={<CateringTableSkeleton />}>
          <CateringData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </PageShell>
  );
}

async function CateringData({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission({ order: ["read"] });

  const sp = await searchParams;
  const sort = parseSort(sp, SORT_COLUMNS, { column: "submitted", dir: "desc" });
  const { condition, page } = parseFilterState(SPEC, sp);

  const result = await listCateringInquiriesPage(condition, page, sort);

  return (
    <CateringTable
      spec={SPEC}
      rows={result.items.map((r) => ({
        ...r,
        submittedLabel: shopDate(r.createdAt),
      }))}
      total={result.total}
      page={page.page}
      size={page.size}
      sort={sort}
    />
  );
}
