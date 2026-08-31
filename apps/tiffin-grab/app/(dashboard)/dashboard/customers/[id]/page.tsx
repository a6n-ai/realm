import { Suspense } from "react";
import { notFound } from "next/navigation";
import { UsersIcon } from "lucide-react";
import { NotFoundError, formatPhone } from "@realm/commons";
import { requireStaff } from "@/lib/auth/guards";
import { getCustomer360 } from "@/lib/services/customers.service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { DataTable, PageShell, PageHeader, SectionCard, SkeletonListRows } from "@/components/ds";
import { Skeleton } from "@realm/ui/skeleton";
import { ResendInviteButton } from "./resend-invite-button";
import { CustomerOrdersTable, CUSTOMER_ORDERS_COLUMNS } from "./customer-orders-table";
import { CustomerInquiriesTable, CUSTOMER_INQUIRIES_COLUMNS } from "./customer-inquiries-table";
import { CustomerTimeline } from "./customer-timeline";
// Single source of truth for the section cards. The real view and the loading
// twin below both render from this, so the skeleton can never drift from the page.
const SECTIONS = {
  profile: { title: "Profile" },
  orders: { title: "Orders" },
  inquiries: { title: "Inquiries" },
  timeline: { title: "Activity timeline", rows: 4 },
} as const;

// This page is the index across a person's subscriptions — each row links into the order
// page, which owns the calendar, meal picks, payment, and log for that one order.

export default function Customer360Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <PageShell>
      <PageHeader icon={UsersIcon} title="Customer" />
      <Suspense fallback={<Customer360Data.Skeleton />}>
        <Customer360Data params={params} />
      </Suspense>
    </PageShell>
  );
}

async function Customer360Data({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;

  const settingsP = getAppSettings();
  let data;
  try {
    data = await getCustomer360(id);
  } catch (e) {
    void settingsP.catch(() => {});
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { timezone } = await settingsP;

  return (
    <>
      <SectionCard title={SECTIONS.profile.title}>
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">{data.profile.phone ? formatPhone(data.profile.phone) : "no phone"} · {data.profile.email ?? "no email"}</p>
          <ResendInviteButton email={data.profile.email} />
        </div>
      </SectionCard>

      <SectionCard title={SECTIONS.orders.title}>
        <CustomerOrdersTable orders={data.orders} />
      </SectionCard>

      <SectionCard title={SECTIONS.inquiries.title}>
        <CustomerInquiriesTable inquiries={data.inquiries} />
      </SectionCard>

      <SectionCard title={SECTIONS.timeline.title}>
        <CustomerTimeline entries={data.timeline} timezone={timezone} />
      </SectionCard>
    </>
  );
}

// Exact loading twin: same SECTIONS + same SectionCard markup, grey blocks
// instead of data. Rendered as the page's <Suspense fallback>, so it always
// matches Customer360Data by construction.
Customer360Data.Skeleton = function Customer360DataSkeleton() {
  return (
    <>
      <SectionCard title={SECTIONS.profile.title}>
        <Skeleton className="h-4 w-64" />
      </SectionCard>
      <SectionCard title={SECTIONS.orders.title}>
        <DataTable.Skeleton columns={CUSTOMER_ORDERS_COLUMNS} idLabel="Deployment" hasId />
      </SectionCard>
      <SectionCard title={SECTIONS.inquiries.title}>
        <DataTable.Skeleton columns={CUSTOMER_INQUIRIES_COLUMNS} />
      </SectionCard>
      <SectionCard title={SECTIONS.timeline.title}>
        <SkeletonListRows rows={SECTIONS.timeline.rows} />
      </SectionCard>
    </>
  );
};
