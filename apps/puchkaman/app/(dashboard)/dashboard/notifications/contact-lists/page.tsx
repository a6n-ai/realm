import { Suspense } from "react";
import { asc, count, desc, sql } from "drizzle-orm";
import { ListIcon, UsersIcon } from "lucide-react";
import { columnResolver, conditionToSql } from "@foundry/database";
import { ResponsiveDialog, SectionCard, StatCard, parseFilterState, type FacetDef } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { app, contactList } from "@/db/schema";
import { parseSort, type SortState } from "@/lib/list/sort";
import {
  ContactListFromSegment,
  ContactListManualAdd,
  ContactListUpload,
} from "@relay/engine/ui";
import { ContactListsTable, ContactListsTableSkeleton, type ContactListRow } from "./contact-lists-table";

export const dynamic = "force-dynamic";

const SORT_COL = {
  name: contactList.name,
  memberCount: contactList.memberCount,
  createdAt: contactList.createdAt,
} as const;

type ContactListSortColumn = keyof typeof SORT_COL;

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
        <StatsData />
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
              <div className="p-4">
                <ContactListFromSegment requiresVerifiedPhone />
              </div>
            </ResponsiveDialog>
            <ResponsiveDialog
              title="Import a list"
              description="CSV. Preview and pick which contacts to keep before anything is saved."
              trigger={<Button>Import CSV</Button>}
            >
              <div className="p-4">
                <ContactListUpload />
              </div>
            </ResponsiveDialog>
            <ResponsiveDialog
              title="Add contacts by hand"
              description="For a handful of people — no spreadsheet needed."
              trigger={<Button variant="outline">Add manually</Button>}
            >
              <div className="p-4">
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

async function StatsData() {
  await requireAdmin();
  const [[{ n: listCount }], [{ total }]] = await Promise.all([
    db.select({ n: count() }).from(contactList),
    db.select({ total: sql<number>`cast(coalesce(sum(${contactList.memberCount}), 0) as int)` }).from(contactList),
  ]);
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
  await requireAdmin();
  const sp = await searchParams;

  const sort: SortState<ContactListSortColumn> = parseSort(sp, ["name", "memberCount", "createdAt"], {
    column: "createdAt",
    dir: "desc",
  });
  const { condition, page } = parseFilterState(SPEC, sp);
  const where = conditionToSql(
    condition,
    columnResolver({
      name: contactList.name,
      consentSource: contactList.consentSource,
      createdAt: contactList.createdAt,
    }),
  );

  const col = SORT_COL[sort.column];
  const orderBy = sort.dir === "asc" ? asc(col) : desc(col);

  const [rows, [totalRow], [appRow]] = await Promise.all([
    db
      .select({
        publicId: contactList.publicId,
        name: contactList.name,
        consentSource: contactList.consentSource,
        consentAt: contactList.consentAt,
        consentNote: contactList.consentNote,
        memberCount: contactList.memberCount,
        segmentDef: contactList.segmentDef,
        createdAt: contactList.createdAt,
      })
      .from(contactList)
      .where(where)
      .orderBy(orderBy)
      .limit(page.size)
      .offset(page.page * page.size),
    db.select({ n: count() }).from(contactList).where(where),
    db.select({ timezone: app.timezone }).from(app).limit(1),
  ]);

  const tableRows: ContactListRow[] = rows.map((r) => ({ ...r, isSegment: r.segmentDef != null }));

  return (
    <ContactListsTable
      spec={SPEC}
      rows={tableRows}
      sort={sort}
      total={Number(totalRow?.n ?? 0)}
      page={page.page}
      size={page.size}
      timeZone={appRow?.timezone ?? "America/Toronto"}
    />
  );
}

export type { ContactListSortColumn };
