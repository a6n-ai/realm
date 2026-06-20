import Link from "next/link";
import { count, desc } from "drizzle-orm";
import {
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  InboxIcon,
  PlusIcon,
  TrendingUpIcon,
  UsersIcon,
} from "lucide-react";
import { db } from "@/db/client";
import { inquiries } from "@/db/schema";
import { requireStaff } from "@/lib/auth/guards";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddInquirySheet } from "./new-inquiry-form";
import { StageBadge } from "./stage-badge";

const PAGE_SIZE = 10;

function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export default async function InquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireStaff();
  const { page: pageParam } = await searchParams;
  const page = parsePage(pageParam);

  const [stageCounts, [{ total }], rows] = await Promise.all([
    db.select({ stage: inquiries.stage, n: count() }).from(inquiries).groupBy(inquiries.stage),
    db.select({ total: count() }).from(inquiries),
    db
      .select()
      .from(inquiries)
      .orderBy(desc(inquiries.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
  ]);

  const countOf = (...stages: string[]) =>
    stageCounts.filter((r) => stages.includes(r.stage)).reduce((sum, r) => sum + r.n, 0);

  const open = countOf("new", "contacted", "follow_up");
  const converted = countOf("converted");
  const conversionRate = total > 0 ? Math.round((converted / total) * 100) : 0;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const end = Math.min(safePage * PAGE_SIZE, total);

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="gradient-text text-2xl font-semibold">Inquiries</h1>
          <p className="text-muted-foreground text-sm">Lead pipeline at a glance.</p>
        </div>
      </div>

      {/* Insights */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={InboxIcon} label="Total" value={total} hint="all inquiries" />
        <StatCard icon={UsersIcon} label="Open" value={open} hint="new · contacted · follow-up" />
        <StatCard
          icon={TrendingUpIcon}
          label="Converted"
          value={converted}
          hint={`${conversionRate}% conversion`}
        />
        <AddInquirySheet
          trigger={
            <button
              type="button"
              className="group border-primary/30 bg-primary/5 hover:bg-primary/10 card-glow hover-lift flex flex-col items-start justify-between gap-3 rounded-xl border border-dashed p-4 text-left"
            >
              <div className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
                <PlusIcon className="icon-pop size-5" />
              </div>
              <div>
                <div className="font-medium">Add inquiry</div>
                <div className="text-muted-foreground text-xs">Capture a new lead</div>
              </div>
            </button>
          }
        />
      </div>

      {/* Table */}
      <Card className="card-glow overflow-hidden p-0">
        <CardHeader className="flex flex-row items-center justify-between border-b py-4">
          <CardTitle className="text-base">All inquiries</CardTitle>
          <span className="text-muted-foreground text-xs">
            {total === 0 ? "Nothing yet" : `${start}–${end} of ${total}`}
          </span>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground h-24 text-center">
                    No inquiries on this page.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((inq) => (
                  <TableRow key={inq.publicId} className="group">
                    <TableCell className="font-medium">
                      <Link href={`/dashboard/inquiries/${inq.publicId}`} className="hover:underline">
                        {inq.fullName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{inq.phone}</TableCell>
                    <TableCell className="text-muted-foreground capitalize">{inq.source}</TableCell>
                    <TableCell>
                      <StageBadge stage={inq.stage} />
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/dashboard/inquiries/${inq.publicId}`}
                        className="text-muted-foreground hover:text-foreground inline-flex"
                        aria-label={`Open ${inq.fullName}`}
                      >
                        <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">
            Page {safePage} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" disabled={safePage <= 1}>
              <Link href={`/dashboard/inquiries?page=${safePage - 1}`} aria-disabled={safePage <= 1}>
                <ChevronLeftIcon className="size-4" />
                Prev
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" disabled={safePage >= totalPages}>
              <Link href={`/dashboard/inquiries?page=${safePage + 1}`} aria-disabled={safePage >= totalPages}>
                Next
                <ChevronRightIcon className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <Card className="group card-glow hover-lift gap-0">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <span className="text-muted-foreground text-sm font-medium">{label}</span>
        <span className="bg-muted text-muted-foreground flex size-8 items-center justify-center rounded-lg">
          <Icon className="icon-pop size-4" />
        </span>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tabular-nums">{value}</div>
        <div className="text-muted-foreground mt-1 text-xs">{hint}</div>
      </CardContent>
    </Card>
  );
}
