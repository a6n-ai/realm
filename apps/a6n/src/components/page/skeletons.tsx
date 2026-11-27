import { Toolbar } from "@foundry/console/toolbar";
import { Skeleton } from "@foundry/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@foundry/ui/table";
import type { ReactNode } from "react";
import { Panel as DetailPanel } from "../inquiries/inquiry-detail";
import { PageHeader } from "../shell/page-header";
import { Panel } from "./panel";
import { SettingsCard } from "./settings-card";

// Every piece sits in the same box as the loaded one (text-sm line = h-5), so nothing shifts when data lands.
export function Loading() {
  return (
    <span role="status" className="sr-only">
      Loading…
    </span>
  );
}

export function Bar({ w = "w-24", lines = 1 }: { w?: string; lines?: 1 | 2 }) {
  return (
    <div className="grid gap-0">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="flex h-5 items-center">
          <Skeleton className={`h-3.5 ${i === 1 ? "w-3/5" : w}`} />
        </div>
      ))}
    </div>
  );
}

export function ToolbarSkeleton({ chips = 3 }: { chips?: number }) {
  return (
    <Toolbar
      search={<Skeleton className="h-8 w-full" />}
      filters={
        <>
          <Skeleton className="h-8 w-28" />
          {Array.from({ length: chips }, (_, i) => (
            <Skeleton key={i} shape="pill" className="h-7 w-24" />
          ))}
        </>
      }
    />
  );
}

export type SkeletonColumn = { header: string; w?: string; lines?: 1 | 2; secondary?: boolean; numeric?: boolean; pill?: boolean };

// Real column headers, skeleton cells; secondary columns hide under sm like ResourceTable's.
export function TableSkeleton({ columns, rows = 6 }: { columns: SkeletonColumn[]; rows?: number }) {
  const hide = (c: SkeletonColumn) => (c.secondary ? "hidden sm:table-cell" : undefined);
  return (
    <Panel>
      <Table aria-hidden="true">
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            {columns.map((c) => (
              <TableHead key={c.header} className={[hide(c), c.numeric && "text-right"].filter(Boolean).join(" ") || undefined}>
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }, (_, r) => (
            <TableRow key={r}>
              <TableCell className="w-10">
                <Bar w="w-3" />
              </TableCell>
              {columns.map((c) => (
                <TableCell key={c.header} className={hide(c)}>
                  {c.pill ? <Skeleton shape="pill" className="h-5 w-20" /> : <Bar w={c.w} lines={c.lines} />}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Panel>
  );
}

// A SettingsCard with its real title and description; the footer strip and action are skeleton.
export function SettingsCardSkeleton({ title, description, action = true, children }: { title: string; description?: string; action?: boolean; children?: ReactNode }) {
  return (
    <SettingsCard title={title} description={description} footer={<Skeleton className="h-4 w-48" />} action={action ? <Skeleton className="h-9 w-28" /> : undefined}>
      {children}
    </SettingsCard>
  );
}

// Two-line rows with a menu button on the right: roles, teams, organisations.
export function RowListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul className="grid divide-y" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
          <div className="grid min-w-0 flex-1 gap-1">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-56 max-w-full" />
          </div>
          <Skeleton className="size-9" />
        </li>
      ))}
    </ul>
  );
}

export function FieldSkeleton() {
  return (
    <div className="grid gap-2">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}

const inquiryColumns: SkeletonColumn[] = [
  { header: "Contact", w: "w-40", lines: 2 },
  { header: "Stage", pill: true },
  { header: "Owner", w: "w-28", secondary: true },
  { header: "Follow-up", w: "w-24" },
];

export function InquiriesSkeleton() {
  return (
    <>
      <PageHeader crumbs={[{ label: "Inquiries" }]} />
      <nav aria-hidden="true" className="flex gap-1 px-3 pb-2">
        {["w-12", "w-20", "w-8"].map((w) => (
          <div key={w} className="flex h-9 items-center px-3">
            <Skeleton className={`h-4 ${w}`} />
          </div>
        ))}
      </nav>
      <ToolbarSkeleton />
      <TableSkeleton columns={inquiryColumns} />
      <Loading />
    </>
  );
}

export function SourcesSkeleton() {
  return (
    <>
      <PageHeader crumbs={[{ label: "Sources" }]} description="The channels inquiries come from." />
      <div className="flex flex-wrap items-center gap-2 px-4 pb-4">
        <Skeleton className="h-9 w-28" />
        <Skeleton shape="pill" className="h-7 w-24" />
        <Skeleton shape="pill" className="h-7 w-24" />
      </div>
      <Panel>
        <div className="divide-y" aria-hidden="true">
          {[2, 3, 1].map((subs, i) => (
            <section key={i} className="grid gap-3 p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-16" />
                <span className="ml-auto flex items-center gap-2">
                  <Skeleton className="size-9" />
                  <Skeleton shape="pill" className="h-5 w-9" />
                </span>
              </div>
              <ul className="grid gap-2">
                {Array.from({ length: subs }, (_, j) => (
                  <li key={j} className="flex items-center gap-3 text-sm">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-14" />
                    <span className="ml-auto flex items-center gap-2">
                      <Skeleton className="size-9" />
                      <Skeleton shape="pill" className="h-5 w-9" />
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Panel>
      <Loading />
    </>
  );
}

const crumbs = [{ label: "Inquiries", to: "/inquiries" }, { label: "Inquiry" }];

export function InquiryDetailSkeleton() {
  return (
    <>
      <PageHeader crumbs={crumbs} actions={<Skeleton className="h-9 w-20" />} />
      <div className="grid gap-4 px-4 pb-8 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]" aria-hidden="true">
        <div className="grid content-start gap-4">
          <DetailPanel title="Contact">
            <div className="grid gap-3">
              {["Name", "Phone", "Email", "Company", "Source", "Requirements", "Created"].map((l) => (
                <div key={l} className="grid gap-0.5">
                  <span className="text-xs text-muted-foreground">{l}</span>
                  <Bar w="w-36" />
                </div>
              ))}
            </div>
          </DetailPanel>
          <DetailPanel title="Stage">
            <Skeleton className="h-9 w-full" />
          </DetailPanel>
          <DetailPanel title="Owner">
            <Skeleton className="h-9 w-full" />
          </DetailPanel>
          <DetailPanel title="Follow-up">
            <Skeleton shape="pill" className="h-5 w-24" />
            <div className="flex items-end gap-2">
              <div className="grid flex-1 gap-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-full" />
              </div>
              <Skeleton className="h-9 w-24" />
            </div>
          </DetailPanel>
        </div>
        <div className="grid content-start gap-4">
          <DetailPanel title="Log activity">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-9 w-24" />
          </DetailPanel>
          <DetailPanel title="Activity">
            <ul className="grid gap-4">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex gap-3">
                  <Skeleton shape="pill" className="size-6 shrink-0" />
                  <div className="grid flex-1 gap-1">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                </li>
              ))}
            </ul>
          </DetailPanel>
        </div>
      </div>
      <Loading />
    </>
  );
}

export function AdminSkeleton() {
  return (
    <>
      <PageHeader crumbs={[{ label: "Organisations" }]} description="Platform administration. Only super admins see this page." />
      <div className="grid max-w-4xl gap-6 px-4 pb-8">
        <SettingsCardSkeleton title="Create organisation" description="Each organisation has its own people, roles, inquiries and sources.">
          <div className="grid gap-3 sm:grid-cols-2" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <FieldSkeleton key={i} />
            ))}
          </div>
        </SettingsCardSkeleton>
        <SettingsCardSkeleton title="All organisations" action={false}>
          <RowListSkeleton />
        </SettingsCardSkeleton>
      </div>
      <Loading />
    </>
  );
}

const memberColumns: SkeletonColumn[] = [
  { header: "Member", w: "w-40", lines: 2 },
  { header: "Role", w: "w-20", secondary: true },
  { header: "Status", pill: true },
  { header: "Invite", w: "w-20", secondary: true },
  { header: "Last sign-in", w: "w-24", secondary: true },
  { header: "Open inquiries", w: "w-6", secondary: true, numeric: true },
];

export function MembersSkeleton() {
  return (
    <>
      <SettingsCardSkeleton title="Invite Team Members" description="They get an email to set a password.">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" aria-hidden="true">
          <FieldSkeleton />
          <FieldSkeleton />
          <FieldSkeleton />
        </div>
      </SettingsCardSkeleton>
      <section aria-label="Members" className="grid [&>div:first-child]:px-0 [&_[data-slot=card-content]]:mx-0 [&_[data-slot=card-content]]:mb-0">
        <ToolbarSkeleton chips={2} />
        <TableSkeleton columns={memberColumns} />
      </section>
      <Loading />
    </>
  );
}

export function RolesSkeleton() {
  return (
    <>
      <SettingsCardSkeleton title="Roles" description="What each role can do in this organisation. Owner, Admin and Member are built in; create your own for anything else.">
        <RowListSkeleton />
      </SettingsCardSkeleton>
      <Loading />
    </>
  );
}

export function TeamsSkeleton() {
  return (
    <>
      <SettingsCardSkeleton title="Teams" description="Group people in this organisation. Someone can be in several teams.">
        <RowListSkeleton />
      </SettingsCardSkeleton>
      <Loading />
    </>
  );
}

export function OrgChartSkeleton() {
  return (
    <>
      <SettingsCardSkeleton title="Org chart" description="Who reports to whom, with each person's teams. Set reporting lines from Members." action={false}>
        <div className="flex flex-wrap justify-center gap-4" aria-hidden="true">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-20 w-56 rounded-xl" />
          ))}
        </div>
      </SettingsCardSkeleton>
      <Loading />
    </>
  );
}
