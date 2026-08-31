import { Suspense } from "react";
import { and, eq, gte, sql, type SQL } from "drizzle-orm";
import { MailIcon } from "lucide-react";
import type { FilterCondition } from "@realm/commons";
import { conditionToSql } from "@realm/database";
import {
  DataTable,
  ListPagination,
  SectionCard,
  SkeletonStatCards,
  StatGrid,
  parseFilterState,
  type FacetDef,
} from "@realm/design-system";
import { Badge } from "@realm/ui/badge";
import { TableCell } from "@realm/ui/table";
import { db } from "@/db/client";
import { emailLog, messageSuppression } from "@/db/schema";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";

type SearchParams = Promise<Record<string, string | undefined>>;

// Status + recipient filters, same facet framework as the orders/products
// tables. The list is a UNION (sends + suppressions), so we resolve facet fields
// to the union alias `t.*` instead of a single table's columns.
const SPEC: FacetDef[] = [
  {
    kind: "pills",
    field: "status",
    label: "Status",
    options: [
      { value: "sent", label: "Sent" },
      { value: "failed", label: "Failed" },
      { value: "suppressed", label: "Suppressed" },
    ],
  },
  { kind: "search", fields: ["recipient"] },
];

function resolveEmailFacet(f: FilterCondition): SQL | undefined {
  if (f.field === "status") return sql`t.status = ${String(f.value)}`;
  if (f.field === "recipient") return sql`t.recipient ilike ${String(f.value)}`;
  return undefined;
}

export default function EmailsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<EmailsSkeleton />}>
      <EmailsData searchParams={searchParams} />
    </Suspense>
  );
}

type ActivityRow = {
  at: number;
  recipient: string | null;
  subject: string;
  status: string;
  error: string | null;
};

// No server-side sort on this union query today — columns are display-only.
type EmailColumn = "time" | "recipient" | "subject" | "status";
const COLUMNS: readonly { key: EmailColumn; label: string }[] = [
  { key: "time", label: "Time" },
  { key: "recipient", label: "Recipient" },
  { key: "subject", label: "Subject / reason" },
  { key: "status", label: "Status" },
];

async function EmailsData({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { condition, page } = parseFilterState(SPEC, sp);
  // eslint-disable-next-line react-hooks/purity -- server component: reading the request clock is the point
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const n = sql<number>`cast(count(*) as int)`;

  // Suppression is keyed on the address itself, so this needs no users join and
  // surfaces suppressed addresses that never had an account.
  const base = sql`(
    select el.created_at as at, el.recipient, el.subject, el.status::text as status, el.error
    from ${emailLog} el
    union all
    select ms.created_at as at, ms.address as recipient,
           ms.reason as subject, 'suppressed' as status, null as error
    from ${messageSuppression} ms
    where ms.channel = 'email'
  ) t`;
  const where = conditionToSql(condition, resolveEmailFacet);
  const whereSql = where ? sql` where ${where}` : sql``;

  const [sent24, failed24, totalSent, suppressed, items, totalRes] = await Promise.all([
    db.select({ n }).from(emailLog).where(and(eq(emailLog.status, "sent"), gte(emailLog.createdAt, dayAgo))),
    db.select({ n }).from(emailLog).where(and(eq(emailLog.status, "failed"), gte(emailLog.createdAt, dayAgo))),
    db.select({ n }).from(emailLog).where(eq(emailLog.status, "sent")),
    db.select({ n }).from(messageSuppression).where(eq(messageSuppression.channel, "email")),
    db.execute(
      sql`select at, recipient, subject, status, error from ${base}${whereSql} order by at desc limit ${page.size} offset ${page.page * page.size}`,
    ),
    db.execute(sql`select cast(count(*) as int) as total from ${base}${whereSql}`),
  ]);

  const rows = (items as unknown as ActivityRow[]).map((r, i) => ({
    ...r,
    _rowKey: `${r.recipient}-${r.at}-${i}`,
  }));
  const total = Number((totalRes as unknown as { total: number }[])[0]?.total ?? 0);

  const failedCount = failed24[0]?.n ?? 0;
  const suppressedCount = suppressed[0]?.n ?? 0;
  const cards = [
    { label: "Sent (24h)", value: sent24[0]?.n ?? 0 },
    { label: "Failed (24h)", value: failedCount, tone: failedCount > 0 ? ("bad" as const) : undefined },
    { label: "Total sent", value: totalSent[0]?.n ?? 0 },
    { label: "Suppressed", value: suppressedCount, tone: suppressedCount > 0 ? ("bad" as const) : undefined },
  ];

  return (
    <div className="space-y-5">
      <StatGrid cols={4} items={cards} />

      <SectionCard title="Email log" subtitle="Every send and every suppressed address, newest first.">
        <div className="space-y-4">
          <DataTable
            columns={COLUMNS}
            rows={rows}
            rowKey={(r) => r._rowKey}
            serial={false}
            search={{ placeholder: "Search recipient…", shortPlaceholder: "Search…", debounceMs: 250 }}
            filters={<ReuiFacetFilters spec={SPEC} />}
            emptyIcon={MailIcon}
            emptyMessage="No emails sent yet."
            emptySearchMessage="No emails match your filters."
            renderRow={(r) => (
              <>
                <TableCell className="whitespace-nowrap text-muted-foreground text-sm">
                  {new Date(Number(r.at)).toLocaleString()}
                </TableCell>
                <TableCell className="text-sm">{r.recipient ?? "—"}</TableCell>
                <TableCell className="text-sm">
                  {r.subject}
                  {r.error && <span className="text-destructive block text-xs">{r.error}</span>}
                </TableCell>
                <TableCell>
                  <Badge variant={r.status === "sent" ? "secondary" : "outline"}>{r.status}</Badge>
                </TableCell>
              </>
            )}
          />
          <ListPagination page={page.page} size={page.size} total={total} />
        </div>
      </SectionCard>
    </div>
  );
}

function EmailsSkeleton() {
  return (
    <div className="space-y-5">
      <SkeletonStatCards count={4} />
      <SectionCard title="Email log">
        <DataTable.Skeleton columns={COLUMNS} serial={false} />
      </SectionCard>
    </div>
  );
}
