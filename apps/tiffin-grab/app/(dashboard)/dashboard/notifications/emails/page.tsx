import { Suspense } from "react";
import { and, eq, gte, sql, type SQL } from "drizzle-orm";
import type { FilterCondition } from "@realm/commons";
import { conditionToSql } from "@realm/database";
import { db } from "@/db/client";
import { emailLog, notificationPrefs } from "@/db/schema";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { formatEpoch } from "@/lib/format/datetime";
import { SectionCard, ListPagination, parseFilterState, type FacetDef } from "@/components/ds";
import { ReuiFacetFilters } from "@/components/filters/reui-facet-filters";
import { Badge } from "@realm/ui/badge";
import { Skeleton } from "@realm/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@realm/ui/table";

type SearchParams = Promise<Record<string, string | undefined>>;

// Status + recipient filters, same facet framework as the orders/customers
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

function Tile({ label, value, tone }: { label: string; value: number; tone?: "bad" }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-muted-foreground text-sm">{label}</div>
      <div className={`text-2xl font-semibold ${tone === "bad" && value > 0 ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}

type ActivityRow = { at: number; recipient: string | null; subject: string; status: string; error: string | null };

async function EmailsData({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const { condition, page } = parseFilterState(SPEC, sp);
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const n = sql<number>`cast(count(*) as int)`;

  const base = sql`(
    select el.created_at as at, el.recipient, el.subject, el.status::text as status, el.error
    from ${emailLog} el
    union all
    select np.updated_at as at, u.email as recipient,
           coalesce(np.suppressed_reason, 'suppressed') as subject, 'suppressed' as status, null as error
    from ${notificationPrefs} np join users u on u.id = np.user_id
    where np.channel = 'email' and np.suppressed = true
  ) t`;
  const where = conditionToSql(condition, resolveEmailFacet);
  const whereSql = where ? sql` where ${where}` : sql``;

  const [{ timezone }, sent24, failed24, totalSent, suppressed, items, totalRes] = await Promise.all([
    getAppSettings(),
    db.select({ n }).from(emailLog).where(and(eq(emailLog.status, "sent"), gte(emailLog.createdAt, dayAgo))),
    db.select({ n }).from(emailLog).where(and(eq(emailLog.status, "failed"), gte(emailLog.createdAt, dayAgo))),
    db.select({ n }).from(emailLog).where(eq(emailLog.status, "sent")),
    db.select({ n }).from(notificationPrefs).where(and(eq(notificationPrefs.channel, "email"), eq(notificationPrefs.suppressed, true))),
    db.execute(sql`select at, recipient, subject, status, error from ${base}${whereSql} order by at desc limit ${page.size} offset ${page.page * page.size}`),
    db.execute(sql`select cast(count(*) as int) as total from ${base}${whereSql}`),
  ]);

  const rows = items as unknown as ActivityRow[];
  const total = Number((totalRes as unknown as { total: number }[])[0]?.total ?? 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Sent (24h)" value={sent24[0]?.n ?? 0} />
        <Tile label="Failed (24h)" value={failed24[0]?.n ?? 0} tone="bad" />
        <Tile label="Total sent" value={totalSent[0]?.n ?? 0} />
        <Tile label="Suppressed" value={suppressed[0]?.n ?? 0} tone="bad" />
      </div>

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
                        {formatEpoch(Number(r.at), { mode: "datetime", timeZone: timezone })}
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
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
