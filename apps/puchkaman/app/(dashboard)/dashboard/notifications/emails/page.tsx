import { Suspense } from "react";
import { and, eq, gte, sql, type SQL } from "drizzle-orm";
import type { FilterCondition } from "@foundry/commons";
import { conditionToSql } from "@foundry/database";
import {
  ListPagination,
  SectionCard,
  SkeletonStatCards,
  StatGrid,
  parseFilterState,
  type FacetDef,
} from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { Skeleton } from "@foundry/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@foundry/ui/table";
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

  const rows = items as unknown as ActivityRow[];
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
          <ReuiFacetFilters spec={SPEC} />
          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">No emails match.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Subject / reason</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={`${r.recipient}-${r.at}-${i}`}>
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
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
        <div className="space-y-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
