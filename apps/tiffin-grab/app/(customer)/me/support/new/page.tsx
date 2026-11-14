import { requireCustomerSession } from "@/lib/account/customer";
import { parseIsoDate } from "@/lib/dates/iso-date";
import { Suspense } from "react";
import { getCustomerDashboard } from "@/lib/services/customers.service";
import { PageHeader } from "@/components/kit";
import { BackLink } from "@/components/customer/support/parts";
import { NewTicketForm, NewTicketFormSkeleton } from "@/components/customer/support/new-ticket-form";
import { SupportHoursSlot } from "@/components/customer/support/support-hours";
import { TICKET_CATEGORIES } from "@/lib/support/ticket-taxonomy";
import { humanDate } from "@/lib/deliveries/view";

type SearchParams = Promise<{ orderId?: string; date?: string }>;

export default function NewTicketPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackLink href="/me/support" label="Support" />
      <PageHeader eyebrow="Support" title="New" accent="ticket" subtitle="Tell us what's going on. You can attach photos or screenshots, and link a plan if it helps." />
      <Suspense fallback={null}>
        <SupportHoursSlot compact />
      </Suspense>
      <Suspense fallback={<NewTicketFormSkeleton />}>
        <TicketFormData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function TicketFormData({ searchParams }: { searchParams: SearchParams }) {
  const session = await requireCustomerSession();

  const { orderId, date } = await searchParams;
  const dashboard = await getCustomerDashboard(session.user.id);

  const orderOptions = dashboard.orders.map((o) => ({
    value: o.publicId,
    label: [o.deploymentId, o.planName, o.mealSizeName].filter(Boolean).join(" · "),
  }));

  // A valid ?orderId= preselects the plan/order and defaults the category to "order".
  // Sub-category is never defaulted — the customer picks it for their own case.
  const preselected = orderId && orderOptions.some((o) => o.value === orderId) ? orderId : undefined;

  return (
    <NewTicketForm
      categories={TICKET_CATEGORIES}
      orders={orderOptions}
      defaultOrderId={preselected}
      // A delivery card's "Need help?" passes its date; only a real YYYY-MM-DD becomes the subject.
      defaultSubject={preselected && parseIsoDate(date) ? `Delivery on ${humanDate(parseIsoDate(date)!)}` : undefined}
      {...(preselected ? { defaultCategory: "order" as const } : {})}
    />
  );
}
