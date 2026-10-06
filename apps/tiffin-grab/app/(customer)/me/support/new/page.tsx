import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getCustomerDashboard } from "@/lib/services/customers.service";
import { PageHeader } from "@/components/customer/kit";
import { BackLink } from "@/components/customer/support/parts";
import { NewTicketForm, NewTicketFormSkeleton } from "@/components/customer/support/new-ticket-form";
import { TICKET_CATEGORIES } from "@/lib/support/ticket-taxonomy";
import { humanDate } from "@/lib/deliveries-view";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type SearchParams = Promise<{ orderId?: string; date?: string }>;

export default function NewTicketPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackLink href="/me/support" label="Support" />
      <PageHeader eyebrow="Support" title="New" accent="ticket" subtitle="Tell us what's going on. You can attach photos or screenshots, and link a plan if it helps." />
      <Suspense fallback={<NewTicketFormSkeleton />}>
        <TicketFormData searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function TicketFormData({ searchParams }: { searchParams: SearchParams }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

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
      defaultSubject={preselected && date && ISO_DATE.test(date) ? `Delivery on ${humanDate(date)}` : undefined}
      {...(preselected ? { defaultCategory: "order" as const } : {})}
    />
  );
}
