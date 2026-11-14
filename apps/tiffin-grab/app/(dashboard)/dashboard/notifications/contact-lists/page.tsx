import { pageOffset } from "@foundry/design-system/filters/parse-filter-state";
import { Suspense } from "react";
import Link from "next/link";
import { ListIcon, UsersIcon } from "lucide-react";
import { columnResolver, conditionToSql } from "@foundry/database";
import { ResponsiveDialog, SectionCard, StatCard, parseFilterState, type FacetDef } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { contactList } from "@/db/schema";
import { withDefaultMonth, withListDates } from "@/lib/list/default-month";
import { getAppSettings } from "@/lib/settings";
import { parseSort, type SortState } from "@foundry/design-system/list-sort";
import { ContactListFromSegment } from "@relay/engine/ui/contact-list-from-segment";
import { ContactListManualAdd } from "@relay/engine/ui/contact-list-manual-add";
import { contactListStats, listContactLists, CONTACT_LIST_SORT_COLUMNS, type ContactListSortColumn } from "@/lib/notifications/lists";
import { ContactListsTable, ContactListsTableSkeleton, type ContactListRow } from "./contact-lists-table";

export const dynamic = "force-dynamic";

const SPEC: FacetDef[] = [
  { kind: "search", fields: ["name"] },
  {
    kind: "pills",
    field: "consentSource",
    label: "Consent",
    options: [
      { value: "purchase", label: "Purchase" },
      { value: "express_optin", label: "Express opt-in" },
      { value: "event_signup", label: "Event signup" },
      { value: "import_other", label: "Other" },
    ],
  },
  { kind: "dateRange", field: "createdAt", label: "Created" },
];

type SearchParams = Promise<Record<string, string | undefined>>;

export default function ContactListsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<StatsSkeleton />}>
        <StatsData searchParams={searchParams} />
      </Suspense>

      <SectionCard
        title="Contact lists"
        subtitle="Uploaded audiences, with how consent was obtained."
        action={
          <div className="flex gap-2">
            <ResponsiveDialog
              title="Create from existing customers"
              description="Snapshot customers matching filters (min orders, min spend) into a list. Doesn't update live — use Resync to pull in new matches."
              trigger={<Button variant="outline">Create from customers</Button>}
            >
              <div>
                <ContactListFromSegment requiresVerifiedPhone />
              </div>
            </ResponsiveDialog>
            <Button asChild>
              <Link href="/dashboard/notifications/contact-lists/import">Import CSV</Link>
            </Button>
            <ResponsiveDialog
              title="Add contacts by hand"
              description="For a handful of people — no spreadsheet needed."
              trigger={<Button variant="outline">Add manually</Button>}
            >
              <div>
                <ContactListManualAdd />
              </div>
            </ResponsiveDialog>
          </div>
        }
      >
        <Suspense fallback={<ContactListsTableSkeleton />}>
          <ContactListsData searchParams={searchParams} />
        </Suspense>
      </SectionCard>
    </div>
  );
}

async function StatsData({ searchParams }: { searchParams: SearchParams }) {
  const { lists: listCount, contacts: total } = await contactListStats(await withDefaultMonth(await searchParams));
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <StatCard label="Lists" value={listCount} icon={ListIcon} />
      <StatCard label="Total contacts" value={total} icon={UsersIcon} />
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <StatCard label="Lists" value={0} icon={ListIcon} />
      <StatCard label="Total contacts" value={0} icon={UsersIcon} />
    </div>
  );
}

async function ContactListsData({ searchParams }: { searchParams: SearchParams }) {
  const sp = await withListDates(await searchParams);

  const sort: SortState<ContactListSortColumn> = parseSort(sp, CONTACT_LIST_SORT_COLUMNS, {
    column: "createdAt",
    dir: "desc",
  });
  const { condition, page } = parseFilterState(SPEC, sp);
  const filterWhere = conditionToSql(
    condition,
    columnResolver({
      name: contactList.name,
      consentSource: contactList.consentSource,
      createdAt: contactList.createdAt,
    }),
  );

  const [{ rows, total }, { timezone }] = await Promise.all([
    listContactLists({ filter: filterWhere, sort, size: page.size, offset: pageOffset(page.page, page.size) }),
    getAppSettings(),
  ]);

  const tableRows: ContactListRow[] = rows.map((r) => ({ ...r, isSegment: r.segmentDef != null }));

  return (
    <ContactListsTable
      spec={SPEC}
      rows={tableRows}
      sort={sort}
      total={total}
      page={page.page}
      size={page.size}
      timeZone={timezone}
    />
  );
}

export type { ContactListSortColumn };
